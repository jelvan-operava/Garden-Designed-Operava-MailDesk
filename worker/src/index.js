const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function cors(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.FRONTEND_URL || '').split(',').map((item) => item.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
}
function reply(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } }); }
function requestId(request) { return request.headers.get('cf-ray') || crypto.randomUUID(); }
function errorReply(code, message, status, requestIdValue, headers = {}) {
  return reply({ error: { code, message, requestId: requestIdValue } }, status, { ...headers, 'x-request-id': requestIdValue });
}
function validEmail(value) { return typeof value === 'string' && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function emailIdFromPath(pathname) {
  const match = pathname.match(/^\/emails\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match?.[1] || null;
}
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
    const originHeaders = cors(request, env); const rid = requestId(request);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...originHeaders, 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '86400' } });
    const url = new URL(request.url);
    if (url.pathname === '/health') return reply({ ok: true, requestId: rid }, 200, { ...originHeaders, 'x-request-id': rid });

    if (url.pathname === '/webhooks/resend' && request.method === 'POST') {
      const raw = await request.text();
      let verified = false;
      try { verified = await verifyWebhook(request, raw, env.RESEND_WEBHOOK_SECRET); } catch (_) { verified = false; }
      if (!verified) return errorReply('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature', 401, rid);
      let event;
      try { event = JSON.parse(raw); } catch (_) { return errorReply('INVALID_WEBHOOK_PAYLOAD', 'Invalid webhook JSON', 400, rid); } const resendId = event.data?.email_id || event.data?.email?.id || null;
      const stored = await supabase(env, 'email_events', { method: 'POST', headers: { 'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ resend_event_id: event.data?.id || request.headers.get('svix-id'), resend_id: resendId, event_type: event.type, payload: event }) }, true);
      if (!stored.ok) return errorReply('WEBHOOK_STORE_FAILED', 'Could not store event', 500, rid);
      const status = ({ 'email.sent': 'sent', 'email.bounced': 'failed', 'email.complained': 'failed' })[event.type];
      if (status && resendId) {
        const transition = await supabase(env, `emails?resend_id=eq.${encodeURIComponent(resendId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, error_message: status === 'failed' ? event.type : null, updated_at: new Date().toISOString() }) }, true);
        if (!transition.ok) return errorReply('WEBHOOK_STATE_UPDATE_FAILED', 'Could not apply email status event', 500, rid);
      }
      return reply({ received: true }, 200, { 'x-request-id': rid });
    }

    const user = await requireUser(request, env);
    if (!user) return errorReply('AUTH_REQUIRED', 'Unauthorized', 401, rid, originHeaders);
    if (env.API_RATE_LIMITER) {
      const limit = await env.API_RATE_LIMITER.limit({ key: user.id });
      if (!limit.success) return errorReply('RATE_LIMITED', 'Too many requests', 429, rid, originHeaders);
    }
    const authorization = request.headers.get('authorization');
    if (url.pathname === '/me' && request.method === 'GET') {
      return reply({ id: user.id, email: user.email || null }, 200, { ...originHeaders, 'x-request-id': rid });
    }
    if (url.pathname === '/notifications' && request.method === 'GET') {
      const response = await supabase(env, 'email_events?select=resend_event_id,resend_id,event_type,received_at,payload&order=received_at.desc&limit=100', { headers: { authorization } });
      if (!response.ok) return errorReply('DATABASE_ERROR', 'Could not load delivery events', 502, rid, originHeaders);
      const rows = await response.json();
      return reply(rows.map((event) => ({
        id: event.resend_event_id,
        kind: event.event_type,
        event_type: event.event_type,
        title: event.event_type,
        body: event.resend_id ? `Provider message ${event.resend_id}` : '',
        created_at: event.received_at
      })), 200, { ...originHeaders, 'x-request-id': rid });
    }
    if (url.pathname === '/ai/draft' && request.method === 'POST') {
      let input;
      try { input = await request.json(); } catch (_) { return errorReply('INVALID_REQUEST', 'Invalid JSON body', 400, rid, originHeaders); }
      const instruction = typeof input.instruction === 'string' ? input.instruction.trim() : '';
      const source = typeof input.source === 'string' ? input.source.trim() : '';
      if (!instruction || instruction.length > 4000) return errorReply('INVALID_REQUEST', 'Instruction must be between 1 and 4000 characters', 400, rid, originHeaders);
      if (source.length > 20000) return errorReply('INVALID_REQUEST', 'Source text must not exceed 20000 characters', 400, rid, originHeaders);
      if (!env.AI || !env.AI_MODEL) return errorReply('AI_UNAVAILABLE', 'Workers AI is not configured', 503, rid, originHeaders);
      try {
        const result = await env.AI.run(env.AI_MODEL, {
          messages: [
            { role: 'system', content: 'You assist authenticated OPERAVA MailDesk users with drafting email text. Return only the requested draft text. Never claim an email was sent, never invent delivery status, and never issue instructions to bypass authorization or security controls.' },
            { role: 'user', content: source ? `Instruction:\n${instruction}\n\nSource text:\n${source}` : instruction }
          ]
        });
        const draft = typeof result === 'string' ? result : (result?.response || result?.result?.response || '');
        if (typeof draft !== 'string' || !draft.trim()) return errorReply('AI_INVALID_RESPONSE', 'Workers AI returned no usable draft', 502, rid, originHeaders);
        return reply({ draft: draft.trim(), model: env.AI_MODEL, requestId: rid }, 200, { ...originHeaders, 'x-request-id': rid });
      } catch (_) {
        return errorReply('AI_INFERENCE_FAILED', 'Workers AI inference failed', 503, rid, originHeaders);
      }
    }
    const emailId = emailIdFromPath(url.pathname);
    if (emailId && request.method === 'GET') {
      const response = await supabase(env, `emails?id=eq.${emailId}&select=*`, { headers: { authorization } });
      if (!response.ok) return errorReply('DATABASE_ERROR', 'Could not load email', 502, rid, originHeaders);
      const rows = await response.json();
      if (!rows.length) return errorReply('EMAIL_NOT_FOUND', 'Email not found', 404, rid, originHeaders);
      return reply(rows[0], 200, { ...originHeaders, 'x-request-id': rid });
    }
    if (emailId && request.method === 'PATCH') {
      let input;
      try { input = await request.json(); } catch (_) { return errorReply('INVALID_REQUEST', 'Invalid JSON body', 400, rid, originHeaders); }
      const allowed = ['is_read', 'is_starred', 'is_archived', 'is_deleted'];
      const patch = Object.fromEntries(allowed.filter((key) => typeof input[key] === 'boolean').map((key) => [key, input[key]]));
      if (!Object.keys(patch).length) return errorReply('INVALID_REQUEST', 'At least one supported boolean mailbox flag is required', 400, rid, originHeaders);
      patch.updated_at = new Date().toISOString();
      const response = await supabase(env, `emails?id=eq.${emailId}`, { method: 'PATCH', headers: { authorization, 'content-type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      if (!response.ok) return errorReply('DATABASE_ERROR', 'Could not update email', 502, rid, originHeaders);
      const rows = await response.json();
      if (!rows.length) return errorReply('EMAIL_NOT_FOUND', 'Email not found', 404, rid, originHeaders);
      return reply(rows[0], 200, { ...originHeaders, 'x-request-id': rid });
    }
    if (url.pathname === '/emails' && request.method === 'GET') {
      const response = await supabase(env, 'emails?select=*&order=created_at.desc', { headers: { authorization } });
      if (!response.ok) return errorReply('DATABASE_ERROR', 'Could not load mailbox', 502, rid, originHeaders);
      return new Response(await response.text(), { status: 200, headers: { ...JSON_HEADERS, ...originHeaders, 'x-request-id': rid } });
    }
    if (url.pathname === '/emails' && request.method === 'POST') {
      let input;
      try { input = await request.json(); } catch (_) { return errorReply('INVALID_REQUEST', 'Invalid JSON body', 400, rid, originHeaders); }
      if (!validEmail(input.to)) return errorReply('INVALID_REQUEST', 'A valid recipient email is required', 400, rid, originHeaders);
      if (typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 998) return errorReply('INVALID_REQUEST', 'A subject between 1 and 998 characters is required', 400, rid, originHeaders);
      if (typeof input.html !== 'string' || !input.html.trim() || input.html.length > 500000) return errorReply('INVALID_REQUEST', 'A non-empty HTML body up to 500000 characters is required', 400, rid, originHeaders);
      const create = await supabase(env, 'emails', { method: 'POST', headers: { authorization, 'content-type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, recipient: input.to, subject: input.subject, html: input.html, status: 'queued' }) });
      if (!create.ok) return errorReply('EMAIL_QUEUE_FAILED', 'Could not queue email', 500, rid, originHeaders);
      const [email] = await create.json();
      const sent = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': email.id }, body: JSON.stringify({ from: env.RESEND_FROM, to: [input.to], subject: input.subject, html: input.html }) });
      let payload = {};
      try { payload = await sent.json(); } catch (_) { payload = {}; }
      const providerAccepted = sent.ok && typeof payload.id === 'string' && payload.id.length > 0;
      const update = providerAccepted ? { status: 'sent', resend_id: payload.id, sent_at: new Date().toISOString() } : { status: 'failed', error_message: payload.message || (sent.ok ? 'Resend returned no message identifier' : 'Resend rejected the message') };
      const persisted = await supabase(env, `emails?id=eq.${email.id}`, { method: 'PATCH', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ ...update, updated_at: new Date().toISOString() }) });
      if (!persisted.ok) return errorReply('EMAIL_STATE_PERSIST_FAILED', 'Provider result could not be persisted', 502, rid, originHeaders);
      return reply({ ...email, ...update }, providerAccepted ? 201 : 502, { ...originHeaders, 'x-request-id': rid });
    }
    return errorReply('NOT_FOUND', 'Not found', 404, rid, originHeaders);
  }
};
