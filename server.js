import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from './worker/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  process.loadEnvFile?.();
} catch (_) {}

const app = express();
const PORT = 3000;
const ALT_PORT = process.env.PORT && Number(process.env.PORT) !== 3000 ? Number(process.env.PORT) : null;
const HOST = process.env.HOST || '0.0.0.0';

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://hyzjlznyfjtbehsmxgaq.supabase.co',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'sb_publishable_EkHGEYKWcrhemFS1dNfbfw_AIEPrGtt',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM: process.env.RESEND_FROM || '',
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET || '',
  ZEPTOMAIL_API_KEY: process.env.ZEPTOMAIL_API_KEY || '',
  ZEPTOMAIL_FROM_ADDRESS: process.env.ZEPTOMAIL_FROM_ADDRESS || process.env.ZEPTOMAIL_FROM || process.env.RESEND_FROM || '',
  ZEPTOMAIL_FROM_NAME: process.env.ZEPTOMAIL_FROM_NAME || 'OPERAVA MailDesk',
  ZEPTOMAIL_API_URL: process.env.ZEPTOMAIL_API_URL || 'https://api.zeptomail.com/v1.1/email',
  CLOUDFLARE_AUTH_SECRET: process.env.CLOUDFLARE_AUTH_SECRET || process.env.AUTH_SECRET || '',
  FRONTEND_URL: process.env.FRONTEND_URL || '',
  AI_MODEL: process.env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  AI: null,
  API_RATE_LIMITER: null,
};

// Configure Cloudflare Workers AI client if REST credentials are provided in env
if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
  env.AI = {
    async run(model, input) {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(input)
      });
      if (!response.ok) {
        throw new Error(`Cloudflare AI error: ${response.status}`);
      }
      return response.json();
    }
  };
}

function isApiRoute(pathname) {
  return (
    pathname === '/health' ||
    pathname === '/me' ||
    pathname === '/notifications' ||
    pathname.startsWith('/webhooks') ||
    pathname.startsWith('/ai') ||
    pathname.startsWith('/emails') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/inbound')
  );
}

async function handleWorkerRequest(req, res) {
  try {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const url = new URL(req.originalUrl || req.url, `${protocol}://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }
    }

    const hasBody = !['GET', 'HEAD'].includes(req.method);
    let bodyBuffer;
    if (hasBody) {
      if (Buffer.isBuffer(req.body)) {
        bodyBuffer = req.body;
      } else if (typeof req.body === 'string') {
        bodyBuffer = Buffer.from(req.body);
      } else if (req.body && typeof req.body === 'object') {
        bodyBuffer = Buffer.from(JSON.stringify(req.body));
      }
    }

    const origin = req.get('origin');
    let allowedFrontend = env.FRONTEND_URL || '';
    if (origin) {
      allowedFrontend = allowedFrontend ? `${allowedFrontend},${origin}` : origin;
    }
    const workerEnv = {
      ...env,
      FRONTEND_URL: allowedFrontend,
    };

    const webReq = new Request(url.toString(), {
      method: req.method,
      headers,
      body: bodyBuffer && bodyBuffer.length > 0 ? bodyBuffer : undefined,
      duplex: bodyBuffer && bodyBuffer.length > 0 ? 'half' : undefined
    });

    const webRes = await worker.fetch(webReq, workerEnv);

    res.status(webRes.status);
    webRes.headers.forEach((val, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, val);
      }
    });

    if (webRes.status === 204 || webRes.status === 304) {
      return res.end();
    }

    const ab = await webRes.arrayBuffer();
    res.send(Buffer.from(ab));
  } catch (err) {
    console.error('Worker bridge error:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
}

// API Routes handled by Cloudflare Worker logic
app.use((req, res, next) => {
  if (isApiRoute(req.path)) {
    return express.raw({ type: '*/*', limit: '10mb' })(req, res, () => {
      handleWorkerRequest(req, res);
    });
  }
  next();
});

// Static assets
app.use(express.static(__dirname));

// HTML Routes - SPA host
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/mailbox', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fallback to index.html for any other non-API GET request
app.use((req, res) => {
  if (req.method === 'GET' && !isApiRoute(req.path)) {
    res.sendFile(path.join(__dirname, 'index.html'));
  } else {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`OPERAVA MailDesk running on http://${HOST}:${PORT}`);
});

if (ALT_PORT) {
  try {
    app.listen(ALT_PORT, HOST, () => {
      console.log(`OPERAVA MailDesk also listening on http://${HOST}:${ALT_PORT}`);
    });
  } catch (err) {
    console.warn(`Could not bind to alt port ${ALT_PORT}:`, err.message);
  }
}
