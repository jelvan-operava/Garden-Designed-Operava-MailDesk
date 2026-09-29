# Deploy OPERAVA MailDesk

This guide matches the current Supabase-authenticated Cloudflare Worker implementation. There is no separate ADMIN_EMAIL/ADMIN_PASSWORD login.

## 1. Database
Apply migrations in order, in staging first:
- supabase/migrations/0001_maildesk.sql
- supabase/migrations/0005_inbound_updates.sql
- supabase/migrations/0006_mailbox_foundation.sql

Migration 0006 is additive. It adds mailbox flags and schema foundations for threads, folders, and attachment metadata. Those future workflows are not automatically enabled by applying the migration.

## 2. Cloudflare Worker
From `worker/`, configure these server-side values:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put FRONTEND_URL
npx wrangler deploy
```

`FRONTEND_URL` may be a comma-separated exact-origin allowlist.

Never expose the service-role key, Resend API key, or webhook signing secret in browser configuration.

## 3. Cloudflare Pages
Deploy the static frontend. Configure `app-config.js` with browser-safe values only:
- Supabase project URL
- Supabase anon/publishable key
- deployed Worker URL

## 4. Resend
Verify the sender/domain and configure the signed webhook endpoint:
`POST <WORKER_URL>/webhooks/resend`

The Worker expects Svix/Resend signature headers and `RESEND_WEBHOOK_SECRET`.

## 5. Validation
```bash
node --check app.js
node --check worker/src/index.js
```
Then follow `docs/operations.md` for staging smoke tests. Syntax checks alone are not an end-to-end test.

## Authentication
Supabase Auth is the only end-user authentication authority. Browser requests to protected Worker routes use the Supabase access token as a Bearer token.

## Environment separation
Use separate local/staging/production configuration. Apply schema changes and provider/webhook changes to staging before production.

See `docs/architecture.md`, `docs/security.md`, `docs/api.md`, and `docs/operations.md`.
