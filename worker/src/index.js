import { deliverEmail } from './emailService.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const enc = new TextEncoder();

// In-memory fallback stores for local development and environments without external DB
const memoryUsers = new Map();
const memoryEmails = new Map();
const memoryEvents = [];

function cors(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.FRONTEND_URL || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin) return {};
  if (allowed.length === 0 || allowed.includes('*') || allowed.includes(origin)) {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return {};
}

function reply(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function requestId(request) {
  return request.headers.get('cf-ray') || crypto.randomUUID();
}

function errorReply(code, message, status, requestIdValue, headers = {}) {
  return reply({ error: { code, message, requestId: requestIdValue } }, status, { ...headers, 'x-request-id': requestIdValue });
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function emailIdFromPath(pathname) {
  const match = pathname.match(/^\/emails\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match?.[1] || null;
}

function getAuthSecret(env) {
  return env.CLOUDFLARE_AUTH_SECRET || env.AUTH_SECRET || 'operava-maildesk-cf-auth-secret-key-2026';
}

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return atob(base64);
}

async function hashPassword(password, salt) {
  const saltBytes = salt ? Uint8Array.from(atob(salt), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const hash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  const saltStr = btoa(String.fromCharCode(...saltBytes));
  return { hash, salt: saltStr };
}

async function verifyPassword(password, storedHash, storedSalt) {
  const result = await hashPassword(password, storedSalt);
  return result.hash === storedHash;
}

async function signJwt(payload, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = base64UrlEncode(JSON.stringify(payload));
  const signatureBytes = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${data}`));
  const signature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signatureBytes)));
  return `${header}.${data}.${signature}`;
}

async function verifyJwt(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, d, s] = parts;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigStr = base64UrlDecode(s);
    const sigBytes = Uint8Array.from(sigStr, c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${h}.${d}`));
    if (!valid) return null;
    const payload = JSON.parse(base64UrlDecode(d));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

// Database helper functions (Cloudflare D1 -> Supabase -> Memory fallback)
function supabase(env, path, options = {}, service = false) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    signal: AbortSignal.timeout(4000),
    headers: {
      apikey: service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY,
      ...(options.headers || {})
    }
  });
}

async function getUserByEmail(env, email) {
  const normalized = email.toLowerCase().trim();
  if (env.DB) {
    try {
      const res = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(normalized).first();
      return res || null;
    } catch (_) {}
  }
  return memoryUsers.get(normalized) || null;
}

async function createUser(env, user) {
  const normalized = user.email.toLowerCase().trim();
  const record = { ...user, email: normalized };
  if (env.DB) {
    try {
      await env.DB.prepare('INSERT OR REPLACE INTO users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(record.id, record.email, record.password_hash || '', record.salt || '', record.created_at || new Date().toISOString())
        .run();
    } catch (_) {}
  }
  memoryUsers.set(normalized, record);
  return record;
}

async function getFirstUser(env) {
  if (env.DB) {
    try {
      const res = await env.DB.prepare('SELECT * FROM users LIMIT 1').first();
      if (res) return res;
    } catch (_) {}
  }
  const first = memoryUsers.values().next().value;
  return first || null;
}

async function getEmails(env, userId, authorization) {
  if (env.DB) {
    try {
      const res = await env.DB.prepare('SELECT * FROM emails WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
      return res.results || [];
    } catch (_) {}
  }
  if (env.SUPABASE_URL && authorization && !env.SUPABASE_URL.includes('YOUR_')) {
    try {
      const response = await supabase(env, 'emails?select=*&order=created_at.desc', { headers: { authorization } });
      if (response.ok) return await response.json();
    } catch (_) {}
  }
  return Array.from(memoryEmails.values())
    .filter(e => e.user_id === userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getEmailById(env, emailId, userId, authorization) {
  if (env.DB) {
    try {
      const res = await env.DB.prepare('SELECT * FROM emails WHERE id = ? AND user_id = ?').bind(emailId, userId).first();
      return res || null;
    } catch (_) {}
  }
  if (env.SUPABASE_URL && authorization && !env.SUPABASE_URL.includes('YOUR_')) {
    try {
      const response = await supabase(env, `emails?id=eq.${emailId}&select=*`, { headers: { authorization } });
      if (response.ok) {
        const rows = await response.json();
        return rows[0] || null;
      }
    } catch (_) {}
  }
  const email = memoryEmails.get(emailId);
  return (email && email.user_id === userId) ? email : null;
}

async function createEmail(env, emailRecord, authorization) {
  memoryEmails.set(emailRecord.id, emailRecord);
  if (env.DB) {
    try {
      await env.DB.prepare(`
        INSERT INTO emails (id, user_id, recipient, from_address, direction, subject, html, text_body, status, resend_id, is_read, is_starred, is_archived, is_deleted, created_at, updated_at, sent_at, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        emailRecord.id, emailRecord.user_id, emailRecord.recipient, emailRecord.from_address || null, emailRecord.direction || 'outbound',
        emailRecord.subject, emailRecord.html, emailRecord.text_body || null, emailRecord.status, emailRecord.resend_id || null,
        emailRecord.is_read ? 1 : 0, emailRecord.is_starred ? 1 : 0, emailRecord.is_archived ? 1 : 0, emailRecord.is_deleted ? 1 : 0,
        emailRecord.created_at, emailRecord.updated_at, emailRecord.sent_at || null, emailRecord.received_at || null
      ).run();
    } catch (_) {}
  }
  if (env.SUPABASE_URL && !env.SUPABASE_URL.includes('YOUR_')) {
    try {
      await supabase(env, 'emails', {
        method: 'POST',
        headers: {
          authorization: authorization || `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'content-type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(emailRecord)
      }, !authorization);
    } catch (_) {}
  }
  return emailRecord;
}

async function updateEmail(env, emailId, patch, userId, authorization) {
  const existing = memoryEmails.get(emailId);
  if (existing) {
    Object.assign(existing, patch);
  }
  if (env.DB) {
    try {
      const keys = Object.keys(patch);
      if (keys.length > 0) {
        const setClauses = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => typeof patch[k] === 'boolean' ? (patch[k] ? 1 : 0) : patch[k]);
        await env.DB.prepare(`UPDATE emails SET ${setClauses} WHERE id = ?`).bind(...values, emailId).run();
      }
    } catch (_) {}
  }
  if (env.SUPABASE_URL && !env.SUPABASE_URL.includes('YOUR_')) {
    try {
      await supabase(env, `emails?id=eq.${emailId}`, {
        method: 'PATCH',
        headers: {
          authorization: authorization || `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'content-type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(patch)
      }, !authorization);
    } catch (_) {}
  }
  return existing;
}

async function createEvent(env, eventRecord) {
  memoryEvents.unshift(eventRecord);
  if (env.DB) {
    try {
      await env.DB.prepare('INSERT INTO email_events (id, resend_event_id, resend_id, event_type, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(eventRecord.id, eventRecord.resend_event_id, eventRecord.resend_id || null, eventRecord.event_type, JSON.stringify(eventRecord.payload), eventRecord.received_at)
        .run();
    } catch (_) {}
  }
  if (env.SUPABASE_URL && !env.SUPABASE_URL.includes('YOUR_')) {
    try {
      await supabase(env, 'email_events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify(eventRecord)
      }, true);
    } catch (_) {}
  }
}

async function requireUser(request, env) {
  // 1. Cloudflare Access Zero Trust Header
  const cfEmail = request.headers.get('cf-access-authenticated-user-email');
  if (cfEmail) {
    let user = await getUserByEmail(env, cfEmail.toLowerCase());
    if (!user) {
      user = { id: crypto.randomUUID(), email: cfEmail.toLowerCase(), created_at: new Date().toISOString() };
      await createUser(env, user);
    }
    return { id: user.id, email: user.email };
  }

  // 2. Authorization Bearer Token
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();

  // Verify Cloudflare Worker native HMAC-SHA256 JWT
  const payload = await verifyJwt(token, getAuthSecret(env));
  if (payload?.sub && payload?.email) {
    return { id: payload.sub, email: payload.email };
  }

  // 3. Fallback: Supabase Auth
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY && !env.SUPABASE_URL.includes('YOUR_')) {
    try {
      const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization }
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (_) {}
  }

  return null;
}

function parseMimeBody(raw) {
  let bodyText = '';
  let bodyHtml = '';
  const headerEnd = raw.indexOf('\r\n\r\n');
  const bodyStart = headerEnd !== -1 ? headerEnd + 4 : raw.indexOf('\n\n') + 2;
  const body = bodyStart > 1 ? raw.slice(bodyStart) : raw;

  const boundaryMatch = raw.match(/boundary=["']?([^"';\r\n]+)["']?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = body.split(`--${boundary}`);
    for (const part of parts) {
      if (part.includes('text/html')) {
        const partBodyIndex = part.indexOf('\r\n\r\n') !== -1 ? part.indexOf('\r\n\r\n') + 4 : part.indexOf('\n\n') + 2;
        if (partBodyIndex > 1) {
          bodyHtml = part.slice(partBodyIndex).trim();
        }
      } else if (part.includes('text/plain') && !bodyText) {
        const partBodyIndex = part.indexOf('\r\n\r\n') !== -1 ? part.indexOf('\r\n\r\n') + 4 : part.indexOf('\n\n') + 2;
        if (partBodyIndex > 1) {
          bodyText = part.slice(partBodyIndex).trim();
        }
      }
    }
  }
  if (!bodyHtml && !bodyText) {
    bodyText = body.trim();
  }
  if (!bodyHtml && bodyText) {
    bodyHtml = bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }
  return { bodyText, bodyHtml };
}

function webhookMessage(id, timestamp, body) {
  return `${id}.${timestamp}.${body}`;
}

async function verifyWebhook(request, body, secret) {
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (char) => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const candidates = signature.split(' ').map((item) => item.split(',')[1]).filter(Boolean);
  return (await Promise.all(candidates.map(async (candidate) => {
    const provided = Uint8Array.from(atob(candidate), (char) => char.charCodeAt(0));
    return crypto.subtle.verify('HMAC', cryptoKey, provided, enc.encode(webhookMessage(id, timestamp, body)));
  }))).some(Boolean);
}

export default {
  async fetch(request, env) {
    const originHeaders = cors(request, env);
    const rid = requestId(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...originHeaders,
          'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type,apikey',
          'access-control-max-age': '86400'
        }
      });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      const zepto = Boolean(env.ZEPTOMAIL_API_KEY);
      const resend = Boolean(env.RESEND_API_KEY);
      return reply({
        ok: true,
        service: 'OPERAVA MailDesk API',
        delivery: {
          active: zepto ? 'ZeptoMail' : (resend ? 'Resend' : 'Unconfigured'),
          zeptomail: zepto,
          resend: resend
        },
        inbound: 'Cloudflare Email Routing',
        auth: 'Cloudflare',
        requestId: rid
      }, 200, { ...originHeaders, 'x-request-id': rid });
    }

    // Cloudflare Native Authentication endpoint
    if ((url.pathname === '/auth/v1/token' || url.pathname === '/auth/token' || url.pathname === '/auth/login') && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (_) { return errorReply('INVALID_REQUEST', 'Invalid JSON body', 400, rid, originHeaders); }
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!validEmail(email) || !password) {
        return errorReply('INVALID_CREDENTIALS', 'A valid email and password are required', 400, rid, originHeaders);
      }

      let user = await getUserByEmail(env, email);
      if (!user) {
        // Auto-provision user account with PBKDF2 hash on first sign in
        const { hash, salt } = await hashPassword(password);
        const userId = crypto.randomUUID();
        user = { id: userId, email, password_hash: hash, salt, created_at: new Date().toISOString() };
        await createUser(env, user);
      } else if (user.password_hash) {
        const valid = await verifyPassword(password, user.password_hash, user.salt);
        if (!valid) {
          return errorReply('INVALID_CREDENTIALS', 'Incorrect Password and Email', 401, rid, originHeaders);
        }
      }

      const token = await signJwt({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 604800 }, getAuthSecret(env));
      return reply({
        access_token: token,
        token_type: 'bearer',
        expires_in: 604800,
        user: { id: user.id, email: user.email }
      }, 200, originHeaders);
    }

    if ((url.pathname === '/auth/v1/user' || url.pathname === '/auth/user') && request.method === 'GET') {
      const user = await requireUser(request, env);
      if (!user) return errorReply('AUTH_REQUIRED', 'Unauthorized', 401, rid, originHeaders);
      return reply(user, 200, originHeaders);
    }

    if ((url.pathname === '/auth/v1/recover' || url.pathname === '/auth/recover') && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (_) { return errorReply('INVALID_REQUEST', 'Invalid JSON body', 400, rid, originHeaders); }
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!validEmail(email)) {
        return errorReply('INVALID_REQUEST', 'A valid email is required', 400, rid, originHeaders);
      }
      return reply({ message: 'Password recovery instructions sent if account exists' }, 200, originHeaders);
    }

    // Inbound Email Webhook (for Cloudflare Email Routing Webhook or HTTP Forwarding)
    if ((url.pathname === '/inbound/email' || url.pathname === '/webhooks/inbound') && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (_) { return errorReply('INVALID_REQUEST', 'Invalid JSON body', 400, rid, originHeaders); }
      const from = body.from || body.from_address || body.sender || 'unknown@sender.com';
      const to = body.to || body.recipient || 'inbox@operava.com';
      const subject = body.subject || '(No subject)';
      const html = body.html || body.text || '(Empty message)';
      const text = body.text || '';
      const messageId = body.message_id || body.id || `inbound_${crypto.randomUUID()}`;

      const user = await getUserByEmail(env, to) || await getFirstUser(env);
      const userId = user ? user.id : '00000000-0000-0000-0000-000000000000';

      const emailRecord = {
        id: crypto.randomUUID(),
        user_id: userId,
        recipient: to,
        from_address: from,
        direction: 'inbound',
        subject,
        html,
        text_body: text,
        status: 'sent',
        resend_id: messageId,
        is_read: false,
        is_starred: false,
        is_archived: false,
        is_deleted: false,
        received_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await createEmail(env, emailRecord);
      await createEvent(env, {
        id: crypto.randomUUID(),
        resend_event_id: `cf_email_${crypto.randomUUID()}`,
        resend_id: messageId,
        event_type: 'email.received',
        payload: { from, to, subject, received_at: new Date().toISOString() },
        received_at: new Date().toISOString()
      });

      return reply({ received: true, id: emailRecord.id }, 200, { ...originHeaders, 'x-request-id': rid });
    }

    // Provider Webhook (Resend signed webhook fallback)
    if (url.pathname === '/webhooks/resend' && request.method === 'POST') {
      const raw = await request.text();
      let verified = false;
      try { verified = await verifyWebhook(request, raw, env.RESEND_WEBHOOK_SECRET); } catch (_) { verified = false; }
      if (!verified) return errorReply('INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature', 401, rid);
      let event;
      try { event = JSON.parse(raw); } catch (_) { return errorReply('INVALID_WEBHOOK_PAYLOAD', 'Invalid webhook JSON', 400, rid); }
      const resendId = event.data?.email_id || event.data?.email?.id || null;
      await createEvent(env, {
        id: crypto.randomUUID(),
        resend_event_id: event.data?.id || request.headers.get('svix-id') || crypto.randomUUID(),
        resend_id: resendId,
        event_type: event.type,
        payload: event,
        received_at: new Date().toISOString()
      });
      const status = ({ 'email.sent': 'sent', 'email.bounced': 'failed', 'email.complained': 'failed' })[event.type];
      if (status && resendId) {
        await updateEmail(env, resendId, { status, error_message: status === 'failed' ? event.type : null, updated_at: new Date().toISOString() });
      }
      return reply({ received: true }, 200, { 'x-request-id': rid });
    }

    // Authenticated API Routes
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
      const events = memoryEvents.slice(0, 100);
      return reply(events.map((event) => ({
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
      const instruction = typeof input.instruction === 'string' && input.instruction.trim() ? input.instruction.trim() : (typeof input.prompt === 'string' ? input.prompt.trim() : '');
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
      const email = await getEmailById(env, emailId, user.id, authorization);
      if (!email) return errorReply('EMAIL_NOT_FOUND', 'Email not found', 404, rid, originHeaders);
      return reply(email, 200, { ...originHeaders, 'x-request-id': rid });
    }

    if (emailId && request.method === 'PATCH') {
      let input;
      try { input = await request.json(); } catch (_) { return errorReply('INVALID_REQUEST', 'Invalid JSON body', 400, rid, originHeaders); }
      const allowed = ['is_read', 'is_starred', 'is_archived', 'is_deleted'];
      const patch = Object.fromEntries(allowed.filter((key) => typeof input[key] === 'boolean').map((key) => [key, input[key]]));
      if (!Object.keys(patch).length) return errorReply('INVALID_REQUEST', 'At least one supported boolean mailbox flag is required', 400, rid, originHeaders);
      patch.updated_at = new Date().toISOString();

      const updated = await updateEmail(env, emailId, patch, user.id, authorization);
      if (!updated) return errorReply('EMAIL_NOT_FOUND', 'Email not found', 404, rid, originHeaders);
      return reply(updated, 200, { ...originHeaders, 'x-request-id': rid });
    }

    if (url.pathname === '/emails' && request.method === 'GET') {
      const emails = await getEmails(env, user.id, authorization);
      return reply(emails, 200, { ...originHeaders, 'x-request-id': rid });
    }

    if (url.pathname === '/emails' && request.method === 'POST') {
      let input;
      try { input = await request.json(); } catch (_) { return errorReply('INVALID_REQUEST', 'Invalid JSON body', 400, rid, originHeaders); }
      if (!validEmail(input.to)) return errorReply('INVALID_REQUEST', 'A valid recipient email is required', 400, rid, originHeaders);
      if (typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 998) return errorReply('INVALID_REQUEST', 'A subject between 1 and 998 characters is required', 400, rid, originHeaders);
      if (typeof input.html !== 'string' || !input.html.trim() || input.html.length > 500000) return errorReply('INVALID_REQUEST', 'A non-empty HTML body up to 500000 characters is required', 400, rid, originHeaders);

      const newId = crypto.randomUUID();
      const defaultFrom = env.ZEPTOMAIL_FROM_ADDRESS || env.ZEPTOMAIL_FROM || env.RESEND_FROM || 'mail@operava.com';
      const emailRecord = {
        id: newId,
        user_id: user.id,
        recipient: input.to,
        from_address: defaultFrom,
        direction: 'outbound',
        subject: input.subject,
        html: input.html,
        status: 'queued',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await createEmail(env, emailRecord, authorization);

      // Execute unified delivery via ZeptoMail API and Resend with automatic failover
      const delivery = await deliverEmail(env, {
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        fromAddress: defaultFrom,
        fromName: env.ZEPTOMAIL_FROM_NAME || 'OPERAVA MailDesk',
        emailId: newId
      });

      const update = delivery.success
        ? {
            status: 'sent',
            resend_id: delivery.messageId,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        : {
            status: 'failed',
            error_message: delivery.error || 'Provider rejected message',
            updated_at: new Date().toISOString()
          };

      await updateEmail(env, newId, update, user.id, authorization);

      await createEvent(env, {
        id: crypto.randomUUID(),
        resend_event_id: delivery.messageId || `deliv_${crypto.randomUUID()}`,
        resend_id: delivery.messageId,
        event_type: delivery.success ? 'email.sent' : 'email.failed',
        payload: {
          provider: delivery.provider,
          recipient: input.to,
          subject: input.subject,
          failoverFrom: delivery.failoverFrom || undefined,
          error: delivery.error || undefined,
          timestamp: new Date().toISOString()
        },
        received_at: new Date().toISOString()
      });

      return reply({
        ...emailRecord,
        ...update,
        delivery_provider: delivery.provider,
        failover_from: delivery.failoverFrom || null
      }, delivery.success ? 201 : 502, { ...originHeaders, 'x-request-id': rid });
    }

    return errorReply('NOT_FOUND', 'Not found', 404, rid, originHeaders);
  },

  // Cloudflare Email Routing Inbound Handler
  async email(message, env, ctx) {
    try {
      const from = message.from || 'unknown@sender.com';
      const to = message.to || 'inbox@operava.com';
      const subject = message.headers.get('subject') || '(No subject)';
      const messageId = message.headers.get('message-id') || `cf_msg_${crypto.randomUUID()}`;

      let raw = '';
      try {
        raw = await new Response(message.raw).text();
      } catch (_) {}

      const { bodyText, bodyHtml } = parseMimeBody(raw);

      const user = await getUserByEmail(env, to) || await getFirstUser(env);
      const userId = user ? user.id : '00000000-0000-0000-0000-000000000000';

      const emailRecord = {
        id: crypto.randomUUID(),
        user_id: userId,
        recipient: to,
        from_address: from,
        direction: 'inbound',
        subject,
        html: bodyHtml || bodyText || '(Empty message)',
        text_body: bodyText,
        status: 'sent',
        resend_id: messageId,
        is_read: false,
        is_starred: false,
        is_archived: false,
        is_deleted: false,
        received_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await createEmail(env, emailRecord);

      await createEvent(env, {
        id: crypto.randomUUID(),
        resend_event_id: `cf_email_${crypto.randomUUID()}`,
        resend_id: messageId,
        event_type: 'email.received',
        payload: { from, to, subject, received_at: new Date().toISOString() },
        received_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Cloudflare Email Routing error:', err);
    }
  }
};
