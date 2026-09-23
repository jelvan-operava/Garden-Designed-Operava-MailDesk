import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// In-memory mock store for emails (per web migration guidelines for offline/mock DB)
const inMemoryEmails = [
  {
    id: 'em_1',
    user_id: 'usr_default',
    recipient: 'partner@garden.design',
    subject: 'Welcome to OPERAVA MailDesk',
    html: '<p>Welcome to OPERAVA MailDesk! Your garden-themed email workspace is ready.</p>',
    status: 'sent',
    resend_id: 'resend_welcome_1',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    sent_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'em_2',
    user_id: 'usr_default',
    recipient: 'updates@operava.app',
    subject: 'Delivery Report: Garden Architecture Phase 2',
    html: '<p>The architecture specifications and design tokens have been accepted.</p>',
    status: 'sent',
    resend_id: 'resend_arch_2',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    sent_at: new Date(Date.now() - 7200000).toISOString()
  }
];

const inMemoryEvents = [];

// Auth helper
function isAuthenticated(req) {
  const cookie = req.headers.cookie || '';
  if (cookie.includes('operava_logged_in=true')) return true;
  if (req.query && (req.query.auth === '1' || req.query.session || req.query.logged_in === '1')) return true;
  return false;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  res.setHeader('Set-Cookie', 'operava_logged_in=true; path=/; max-age=86400; SameSite=None; Secure');
  res.json({ ok: true, authenticated: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'operava_logged_in=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None; Secure');
  res.json({ ok: true, authenticated: false });
});

app.get('/api/auth/session', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// Logout endpoint
app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'operava_logged_in=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None; Secure');
  res.redirect(302, '/login?logout=1');
});

// Login Page Route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login_page.html'));
});

// Root URL: route first to login page unless authenticated
app.get('/', (req, res) => {
  if (isAuthenticated(req)) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  res.redirect(302, '/login');
});

// Mailbox / App routes: protected behind authentication
app.get(['/mailbox', '/mail', '/inbox', '/app'], (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect(302, '/login');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Prevent unauthenticated direct access to /index.html
app.get('/index.html', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect(302, '/login');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/backend', (req, res) => {
  res.sendFile(path.join(__dirname, 'operava-maildesk-backend-stack.html'));
});

// API Routes (matching Worker routes in worker/src/index.js)
app.get('/emails', async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const authHeader = req.headers.authorization;

  if (supabaseUrl && !supabaseUrl.includes('YOUR_') && supabaseAnonKey && authHeader) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/emails?select=*&order=created_at.desc`, {
        headers: {
          apikey: supabaseAnonKey,
          authorization: authHeader
        }
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.warn('[AI Studio] Supabase connection failed, falling back to mock emails:', err.message);
    }
  }

  // Fallback to in-memory store
  res.json(inMemoryEmails);
});

app.post('/emails', async (req, res) => {
  const { to, subject, html } = req.body;
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'to, subject, and html are required' });
  }

  const newEmail = {
    id: `em_${Date.now()}`,
    user_id: 'usr_default',
    recipient: to,
    subject,
    html,
    status: 'sent',
    resend_id: `resend_${Date.now()}`,
    created_at: new Date().toISOString(),
    sent_at: new Date().toISOString()
  };

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM || 'OPERAVA MailDesk <mail@operava.app>';

  if (resendApiKey && !resendApiKey.includes('YOUR_')) {
    try {
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${resendApiKey}`,
          'content-type': 'application/json',
          'idempotency-key': newEmail.id
        },
        body: JSON.stringify({ from: resendFrom, to: [to], subject, html })
      });
      const payload = await sent.json();
      if (sent.ok) {
        newEmail.resend_id = payload.id;
        newEmail.status = 'sent';
      } else {
        newEmail.status = 'failed';
        newEmail.error_message = payload.message || 'Resend rejected the message';
      }
    } catch (err) {
      console.warn('[AI Studio] Resend dispatch error:', err.message);
    }
  }

  inMemoryEmails.unshift(newEmail);
  res.status(201).json(newEmail);
});

// Webhook endpoint (Resend webhook ingestion)
app.post('/webhooks/resend', (req, res) => {
  const event = req.body;
  inMemoryEvents.push({ received_at: new Date().toISOString(), payload: event });
  res.json({ received: true });
});

// Static files (index: false ensures express.static does not serve index.html at root /)
app.use(express.static(__dirname, {
  index: false,
  extensions: ['html', 'htm']
}));

// SPA Fallback
app.get('*', (req, res) => {
  if (isAuthenticated(req)) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  res.redirect(302, '/login');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`OPERAVA MailDesk server running on http://0.0.0.0:${PORT}`);
});
