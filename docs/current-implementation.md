# OPERAVA MailDesk — Current Implementation

## Purpose
This is the source-of-truth description of behavior implemented in source code on this branch. Target/planned architecture is documented separately in `docs/architecture.md`.

## Stack
- Static HTML/CSS/JavaScript frontend on Cloudflare Pages (`index.html` unified SPA)
- Cloudflare Native Auth (Web Crypto PBKDF2/HMAC-SHA256 JWT auth on Worker) + Supabase Auth
- Cloudflare Worker API & Cloudflare Email Routing (`worker/src/index.js`)
- Cloudflare D1 Database (`d1/schema.sql`) + Supabase Postgres compatibility
- ZeptoMail REST API outbound delivery (`worker/src/emailService.js`) + Resend fallback
- Cloudflare Email Routing inbound email ingestion (`async email(message, env, ctx)`) & inbound webhook
- Authenticated Cloudflare Workers AI drafting (`env.AI`)

## Frontend UI & Architecture
- **Single Page Application**: `index.html` serves as the primary SPA host containing the unified production UI (Inter + Instrument Serif, warm cream `#f8f5e9` and off-white `#fcfaf4`, rounded card surfaces, purple-to-orange gradient `#8B5CF6` -> `#FB923C`).
- **Complete Views Implemented**:
  - Sign-in with real credential authentication (`POST /auth/v1/token`), password reset modal, show/hide password toggle, and enterprise SSO triggers.
  - MailDesk workspace: Fixed desktop sidebar, mobile drawer bottom sheet (`#bottom-sheet`), live-sync inbox (`#email-list`), real-time search filtering (`#search-input`), Sent folder (`#sent-view`), Trash folder (`#trash-view` with Empty Trash), and Profile Settings (`#profile-view`).
  - Production Email Composer Modal (`#composer`): Connected to real `POST /emails` with recipient validation, subject, and HTML editor.
  - Raw HTML Viewer Modal (`#raw-html-modal`): Real-time sandboxed iframe preview, syntax-highlighted raw HTML `<pre>`, and one-click copy to clipboard.
  - AI HTML Generator (`#templates-view`): Connected to real `POST /ai/draft` (Cloudflare Workers AI), loads generated HTML directly into editor with live iframe preview.
  - Automation Scheduler: Interactive scheduling configuration (`#schedule-modal`) for automation rules allowing users to define frequency (Continuous, Daily, Weekdays, Hourly) and specific start/end times.
  - Execution Logs: History log section in the Automation view displaying trigger timestamps, success/failure status badges, action summaries, simulation testing (`#simulate-run-btn`), and log clearing (`#clear-logs-btn`).
- **Sanitized Structure**: Standalone redundant static HTML files (`login.html`, `mailbox.html`) have been removed; all navigation paths route to the unified `index.html` SPA via `_redirects` and Express static routing.

## Worker routes
| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | /health | Public | Health, delivery provider, and request correlation |
| POST | /auth/v1/token | Public | Authenticate user with Cloudflare Worker Native Auth (PBKDF2/JWT) |
| GET | /auth/v1/user | Cloudflare user | Validate token and return user identity |
| POST | /auth/v1/recover | Public | Password recovery instructions request |
| POST | /inbound/email | Public / Webhook | Receive inbound emails via webhook or Cloudflare Email Routing HTTP |
| POST | /webhooks/resend | Signed webhook | Persist Resend provider event and supported status transition |
| GET | /me | Cloudflare user | Return validated user identity |
| POST | /ai/draft | Cloudflare user | Generate draft text with Workers AI; no mail/data mutation |
| GET | /emails | Cloudflare user | List emails visible to authenticated user |
| GET | /emails/:id | Cloudflare user | Read one email |
| POST | /emails | Cloudflare user | Validate, create, and send email through ZeptoMail (or Resend fallback) |
| PATCH | /emails/:id | Cloudflare user | Update supported mailbox flags |

## Cloudflare Email Routing Handler
`async email(message, env, ctx)` receives inbound emails directly from Cloudflare Email Routing, parses MIME headers and body, stores inbound email records (`direction: 'inbound'`), and writes to `email_events`.

## Authentication
Cloudflare Auth is supported via:
1. Cloudflare Access Zero Trust (`Cf-Access-Authenticated-User-Email` header)
2. Cloudflare Worker Native Auth (`/auth/v1/token` issuing HMAC-SHA256 JWT signed with `CLOUDFLARE_AUTH_SECRET`)
3. Supabase Auth when `SUPABASE_URL` is configured.

## Outbound Email
`POST /emails` delivers messages using ZeptoMail REST API (`https://api.zeptomail.com/v1.1/email`) via `ZEPTOMAIL_API_KEY` and `ZEPTOMAIL_FROM_ADDRESS`, with automatic Resend failover if configured. Missing provider configuration returns structured error response.

## Validation
`npm run check` (runs syntax checks across app.js, worker/src/index.js, and worker/src/emailService.js).

## Documentation rule
Code and migrations are authoritative. Update this document, `llms.txt`, API/deployment docs, and architecture status whenever implementation changes.
