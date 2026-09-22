const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function cors(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.FRONTEND_URL || '').split(',').map((item) => item.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
}
function reply(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } }); }
function supabase(env, path, options = {}, service = false) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY, ...(options.headers || {}) } });
}
async function requireUser(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization } });
  return response.ok ? response.json() : null;
}
function webhookMessage(id, timestamp, body) { return `${id}.${timestamp}.${body}`; }
async function verifyWebhook(request, body, secret) {
  const id = request.headers.get('svix-id'); const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (char) => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const candidates = signature.split(' ').map((item) => item.split(',')[1]).filter(Boolean);
  return (await Promise.all(candidates.map(async (candidate) => {
    const provided = Uint8Array.from(atob(candidate), (char) => char.charCodeAt(0));
    return crypto.subtle.verify('HMAC', cryptoKey, provided, new TextEncoder().encode(webhookMessage(id, timestamp, body)));
  }))).some(Boolean);
}

export default {
  async fetch(request, env) {
    const originHeaders = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...originHeaders, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '86400' } });
    const url = new URL(request.url);
    if (url.pathname === '/health') return reply({ ok: true }, 200, originHeaders);

    if (url.pathname === '/webhooks/resend' && request.method === 'POST') {
      const raw = await request.text();
      if (!(await verifyWebhook(request, raw, env.RESEND_WEBHOOK_SECRET))) return reply({ error: 'Invalid webhook signature' }, 401);
      const event = JSON.parse(raw); const resendId = event.data?.email_id || event.data?.email?.id || null;
      const stored = await supabase(env, 'email_events', { method: 'POST', headers: { 'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ resend_event_id: event.data?.id || request.headers.get('svix-id'), resend_id: resendId, event_type: event.type, payload: event }) }, true);
      if (!stored.ok) return reply({ error: 'Could not store event' }, 500);
      const status = ({ 'email.sent': 'sent', 'email.bounced': 'failed', 'email.complained': 'failed' })[event.type];
      if (status && resendId) await supabase(env, `emails?resend_id=eq.${encodeURIComponent(resendId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, error_message: status === 'failed' ? event.type : null, updated_at: new Date().toISOString() }) }, true);
      return reply({ received: true });
    }

    const user = await requireUser(request, env);
    if (!user) return reply({ error: 'Unauthorized' }, 401, originHeaders);
    const authorization = request.headers.get('authorization');
    if (url.pathname === '/emails' && request.method === 'GET') {
      const response = await supabase(env, 'emails?select=*&order=created_at.desc', { headers: { authorization } });
      return new Response(await response.text(), { status: response.status, headers: { ...JSON_HEADERS, ...originHeaders } });
    }
    if (url.pathname === '/emails' && request.method === 'POST') {
      const input = await request.json();
      if (!input.to || !input.subject || !input.html) return reply({ error: 'to, subject, and html are required' }, 400, originHeaders);
      const create = await supabase(env, 'emails', { method: 'POST', headers: { authorization, 'content-type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, recipient: input.to, subject: input.subject, html: input.html, status: 'queued' }) });
      if (!create.ok) return reply({ error: 'Could not queue email' }, 500, originHeaders);
      const [email] = await create.json();
      const sent = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': email.id }, body: JSON.stringify({ from: env.RESEND_FROM, to: [input.to], subject: input.subject, html: input.html }) });
      const payload = await sent.json();
      const update = sent.ok ? { status: 'sent', resend_id: payload.id, sent_at: new Date().toISOString() } : { status: 'failed', error_message: payload.message || 'Resend rejected the message' };
      await supabase(env, `emails?id=eq.${email.id}`, { method: 'PATCH', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(update) });
      return reply({ ...email, ...update }, sent.ok ? 201 : 502, originHeaders);
    }
    return reply({ error: 'Not found' }, 404, originHeaders);
  }
};
