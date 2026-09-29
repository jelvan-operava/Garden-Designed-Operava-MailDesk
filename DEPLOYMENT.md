# Deploy OPERAVA MailDesk — Production

This repository is a production application. Deployment must use real Supabase, Resend, Cloudflare Worker/Pages, and Workers AI services. Do not deploy mock/demo/sample/fake integrations or disconnected UI.

## 1. Pre-deployment contract
Read:
- `AGENTS.md`
- `docs/current-implementation.md`
- `docs/architecture.md`
- `docs/design-system.md`
- `docs/security.md`
- `docs/cloudflare-ai-deployment.md`
- `docs/operations.md`

The existing OPERAVA MailDesk design/theme is authoritative. Backend, deployment, and AI changes must not silently redesign the application.

## 2. Database
Apply migrations in order in staging first, then production:
- `supabase/migrations/0001_maildesk.sql`
- `supabase/migrations/0005_inbound_updates.sql`
- `supabase/migrations/0006_mailbox_foundation.sql`

Migration 0006 adds mailbox flags and schema foundations. A schema foundation is not permission to expose a fake UI for an unfinished workflow.

## 3. Worker + Workers AI
The Worker uses the Cloudflare Workers AI binding declared in `worker/wrangler.toml`:
```toml
[ai]
binding = "AI"
```
The selected model is the server-side `AI_MODEL` Wrangler variable. Worker code must call AI through `env.AI`; never expose Cloudflare AI credentials/model-control endpoints directly to the browser.

Configure server-only values:
```bash
cd worker
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put FRONTEND_URL
npx wrangler deploy
```

`FRONTEND_URL` may be a comma-separated exact-origin allowlist. Do not commit production secret values.

Workers AI binding/model deployment and verification are documented in `docs/cloudflare-ai-deployment.md`.

## 4. Cloudflare Pages
Deploy the existing static frontend without substituting a starter/template UI. Configure `app-config.js` with browser-safe production values only:
- Supabase project URL
- Supabase anon/publishable key
- deployed Worker URL

Never place service-role, Resend, webhook, or Cloudflare secret tokens in browser assets.

## 5. Resend
Use a verified production sender/domain and configure:
`POST <WORKER_URL>/webhooks/resend`

The Worker verifies Svix/Resend signatures using `RESEND_WEBHOOK_SECRET`. Do not bypass webhook verification in production.

## 6. Validation
```bash
node --check app.js
node --check worker/src/index.js
```
Then run the staging smoke checklist in `docs/operations.md`. For every implemented AI route, perform a real Workers AI inference smoke test. Syntax checks are not E2E tests.

## 7. Release rules
Do not release if:
- any production screen relies on mock/demo data
- a control claims success without a real API/provider result
- auth/RLS is bypassed
- an AI-dependent path silently substitutes fake output
- a secret is present in browser code
- an incidental redesign violates `docs/design-system.md`
- documentation describes planned behavior as live

## Authentication
Supabase Auth is the only end-user authentication authority. Protected Worker requests use the Supabase access token as a Bearer token.

## Environments
Keep local/staging/production configuration separate. Validate migrations, Worker bindings, AI inference, provider webhooks, and UI/API integration in staging before production.
