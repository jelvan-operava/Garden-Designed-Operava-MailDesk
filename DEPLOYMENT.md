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
- **Cloudflare D1 (Recommended)**:
  Apply `d1/schema.sql`:
  ```bash
  npx wrangler d1 execute operava-maildesk-db --file=d1/schema.sql
  ```
- **Supabase (Compatibility Fallback)**:
  Apply migrations in order:
  - `supabase/migrations/0001_maildesk.sql`
  - `supabase/migrations/0005_inbound_updates.sql`
  - `supabase/migrations/0006_mailbox_foundation.sql`
  - `supabase/migrations/0007_cloudflare_and_zeptomail.sql`

## 3. Worker + Workers AI + ZeptoMail + Cloudflare Auth
The Worker uses Cloudflare Workers AI and Cloudflare Email Routing:
```toml
[ai]
binding = "AI"
```
Configure server-only secrets:
```bash
cd worker
npx wrangler login
npx wrangler secret put ZEPTOMAIL_API_KEY
npx wrangler secret put ZEPTOMAIL_FROM_ADDRESS
npx wrangler secret put CLOUDFLARE_AUTH_SECRET
npx wrangler secret put FRONTEND_URL
# Optional fallbacks:
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler deploy
```

## 4. Cloudflare Email Routing (Inbound)
In the Cloudflare Dashboard under Email Routing:
1. Enable Email Routing on your domain.
2. Under "Email Workers", route incoming emails (e.g. `*@yourdomain.com` or `inbox@yourdomain.com`) to the deployed `operava-maildesk-api` Worker.
3. The Worker's `email(message, env, ctx)` handler automatically receives incoming emails, parses sender/subject/body, and stores them in the mailbox.

## 5. Cloudflare Pages
Deploy static assets to Cloudflare Pages.
Configure `app-config.js` to point `apiBaseUrl` and `supabaseUrl` to your deployed Worker origin.

## 6. ZeptoMail (Outbound)
1. In your Zoho ZeptoMail account, add and verify your sending domain (SPF, DKIM, CNAME).
2. Generate an "Agent Send Mail Token" (API Key).
3. Set `ZEPTOMAIL_API_KEY` in Wrangler secrets.
4. Set `ZEPTOMAIL_FROM_ADDRESS` (e.g. `mail@yourdomain.com`).

## 7. Validation
```bash
npm run check
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
