# Deploy OPERAVA MailDesk

This repository deploys as a **Cloudflare Pages static app** plus a **Cloudflare Worker API**. Supabase owns authentication and Postgres; Resend delivers mail and posts signed delivery events to the Worker. No Resend key or Supabase service-role key belongs in Pages or `app-config.js`.

## 1. Create and configure Supabase

1. Create a Supabase project and copy its project URL, **anon** key, and **service_role** key.
2. In **Authentication → Providers → Email**, enable email/password. Create the initial users from **Authentication → Users**, or enable the desired invitation flow. For production, set the Site URL to the final Pages domain and add the Pages preview domain(s) to Redirect URLs if you use email confirmations or resets.
3. Run `supabase/migrations/0001_maildesk.sql` in the SQL Editor (or use `supabase db push` from a linked project). This creates the mailbox tables, indexes, RLS policies, and Realtime publication.

## 2. Configure Resend

1. Add and verify the sending domain in Resend. Publish every DNS record Resend presents before sending production mail.
2. Create a Sending API key and choose one verified mailbox as `RESEND_FROM` (for example, `OPERAVA MailDesk <mail@your-domain.example>`).
3. Deploy the Worker in step 3, then add the webhook endpoint `https://<worker-domain>/webhooks/resend` in Resend. Subscribe to at least `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, and `email.clicked`.
4. Copy the Resend webhook signing secret (`whsec_…`). The Worker validates Svix headers and rejects stale or invalid events before writing `email_events`.

## 3. Deploy the Worker

From `worker/`, authenticate and set values. `FRONTEND_URL` may contain a comma-separated Pages production/preview allowlist.

```bash
cd worker
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
```

Confirm `https://<worker-domain>/health` returns `{"ok":true}`. Use the deployed URL in the next step. Keep `FRONTEND_URL` exact—CORS deliberately does not allow arbitrary origins.

## 4. Deploy Cloudflare Pages

1. In Cloudflare Pages, create a project from this repository.
2. Use the repository root as the build output directory and leave the build command empty. This is a static application; do **not** configure a framework preset that overwrites the files.
3. Before production deploy, replace the three placeholders in `app-config.js` with the Supabase URL, Supabase anon key, and deployed Worker URL. These are public browser values.
4. Deploy and add the final custom domain. Update `FRONTEND_URL` on the Worker to include that exact origin and redeploy the Worker if it changed.

## 5. Production verification

```bash
curl -fsS https://<worker-domain>/health
node --check app.js
node --check worker/src/index.js
```

Then sign in with a Supabase user, send a message to an approved test recipient, and verify: an `emails` row has a Resend ID, the Resend dashboard shows the request, and the webhook creates a matching `email_events` row. Test a Resend webhook from its dashboard only after configuring `RESEND_WEBHOOK_SECRET`.

## Operational notes

- The Worker authenticates every mailbox route against Supabase Auth and passes the user JWT to PostgREST, so RLS remains enforced.
- Webhooks use the service-role key only after signature validation. It is never exposed to the browser.
- The current compose UI sends HTML produced from plain text. Add an approved HTML sanitizer before allowing arbitrary rich-text HTML from untrusted operators.
- Rotate Resend and Supabase secrets in Cloudflare if a secret is exposed; do not commit `.dev.vars`, API keys, or webhook secrets.
