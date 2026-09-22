
# Deploy OPERAVA MailDesk

This guide documents the current repository implementation. It intentionally does not describe unimplemented boards, attachments, storage workflows, or additional mailbox features as if they were live.

## 1. Supabase

1. Create a Supabase project.
2. In Authentication → Providers → Email, enable email/password authentication.
3. Create the users who should be allowed to sign in.
4. Run supabase/migrations/0001_maildesk.sql in the Supabase SQL Editor or apply it through your normal migration workflow.
5. Keep the Supabase service-role key server-side only.

The current migration creates emails and email_events, applies RLS, and adds the emails table to the Realtime publication. The current browser code does not subscribe to Realtime, so Realtime is available at the database layer but is not currently part of the active UI flow.

## 2. Resend

1. Verify the sending domain in Resend.
2. Create a Resend API key.
3. Choose a verified sender for the Worker RESEND_FROM value.
4. Configure a Resend webhook pointing to:

    https://<worker-domain>/webhooks/resend

5. Configure the webhook signing secret as RESEND_WEBHOOK_SECRET.

The Worker verifies the Resend/Svix signature before accepting webhook data.

## 3. Cloudflare Worker

From worker/:

    npm install
    npx wrangler login

    npx wrangler secret put SUPABASE_URL
    npx wrangler secret put SUPABASE_ANON_KEY
    npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
    npx wrangler secret put RESEND_API_KEY
    npx wrangler secret put RESEND_FROM
    npx wrangler secret put RESEND_WEBHOOK_SECRET
    npx wrangler secret put FRONTEND_URL

    npm run check
    npm run deploy

The Worker currently exposes:
- GET /health
- POST /webhooks/resend
- authenticated GET /emails
- authenticated POST /emails

FRONTEND_URL controls the CORS allowlist.

## 4. Static frontend

The production frontend is the repository root:
- index.html
- app.css
- app.js
- app-config.js

For deployment, provide app-config.js with the public Supabase project URL, Supabase anon key, and deployed Worker API URL.

Do not put the service-role key, Resend API key, or webhook secret into app-config.js.

The application can be served as a static Cloudflare Pages site. No framework build step is required by the current repository.

## 5. Verification

    cd worker
    npm run check

    node --check app.js

    curl -fsS https://<worker-domain>/health

Functional test:
1. Open the deployed frontend.
2. Sign in with a configured Supabase user.
3. Confirm the mailbox loads.
4. Compose and send a test message.
5. Confirm the Worker creates/updates the corresponding emails record.
6. Confirm Resend receives the request.
7. Confirm a signed Resend webhook creates the corresponding email_events record.

## 6. Important implementation boundaries

The following are not currently implemented in the production source and must not be documented as live features:
- /boards/* API routes
- sticky-note/board UI
- Supabase Storage attachment workflow
- attachment database records
- folders beyond the current status/filter model
- message threading
- rich-text editor
- file attachments
- browser-side Realtime subscription
- full delivered/opened/clicked mailbox-state synchronization
- GitHub Actions deployment workflow

They can be documented separately as future work when implemented.

## 7. Secrets

Never commit:
- .dev.vars
- Supabase service-role keys
- Resend API keys
- Resend webhook signing secrets

If a server secret is exposed, rotate it in the relevant provider and update the Cloudflare Worker secret.
