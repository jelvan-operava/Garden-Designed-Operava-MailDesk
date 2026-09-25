# Deploy OPERAVA MailDesk

Production deployment guide.

## Cloudflare Worker secrets

```bash
cd worker
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put RESEND_API_TOKEN
npx wrangler secret put RESEND_FROM
npx wrangler secret put WEBHOOK_SIGNING_SECRET
npx wrangler secret put FRONTEND_URL
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

## Admin login

Admin uses `ADMIN_EMAIL` + `ADMIN_PASSWORD` Worker secrets via `POST /auth/login`.
Wrong credentials return: Incorrect Password and Email id

## Pages

Frontend deploys from this repo root. Pages Function: `functions/webhooks/resend.js`

Env on Pages: WEBHOOK_SIGNING_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

## Migration 0005

Run `supabase/migrations/0005_inbound_updates.sql` for inbound emails.
