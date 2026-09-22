# OPERAVA MailDesk

OPERAVA MailDesk is a secure, garden-themed email workspace. It keeps the original light-gray and purple-to-orange visual language while replacing the demo-only flow with a deployable application:

- **Supabase Auth** provides the email/password login and session used by the mailbox.
- **Cloudflare Pages** serves the static application; a **Cloudflare Worker** protects the API.
- **Supabase Postgres + RLS** stores each user’s messages and Resend delivery events.
- **Resend** sends email only from the Worker and posts signed status notifications to `/webhooks/resend`.

## Repository map

| Path | Purpose |
| --- | --- |
| `index.html`, `app.css`, `app.js` | Browser login, mailbox, compose, and send flow. |
| `app-config.js` | Public Pages configuration template (Supabase URL/anon key and Worker URL only). |
| `worker/src/index.js` | Worker API: authenticated mailbox routes, Resend send request, signed webhook ingestion. |
| `worker/wrangler.toml` | Worker deployment configuration. |
| `supabase/migrations/0001_maildesk.sql` | Tables, indexes, RLS, and Realtime publication. |
| `DEPLOYMENT.md` | Complete production setup and verification process. |

## Local checks

```bash
node --check app.js
node --check worker/src/index.js
```

Use `DEPLOYMENT.md` for the required Supabase, Resend, Worker, Pages, CORS, and webhook setup. Do not put a Resend API key, Supabase service-role key, or Resend webhook secret in browser files.

## Legacy design artifacts

`login_page.html`, `mailbox_pages.html`, and `operava-maildesk-backend-stack.html` are retained as visual/reference artifacts. The production entry point is `index.html`.
