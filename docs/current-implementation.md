# OPERAVA MailDesk — Current Implementation

## Purpose
This is the source-of-truth description of behavior implemented in source code on this branch. Target/planned architecture is documented separately in `docs/architecture.md`.

## Stack
- Static HTML/CSS/JavaScript frontend on Cloudflare Pages
- Cloudflare Native Auth (Cloudflare Access headers + Web Crypto PBKDF2/HMAC-SHA256 JWT auth on Worker) + Supabase Auth fallback
- Cloudflare Worker API & Email Routing
- Cloudflare D1 Database (`d1/schema.sql`) + Supabase Postgres compatibility
- ZeptoMail REST API outbound delivery + Resend fallback
- Cloudflare Email Routing inbound email ingestion (`async email(message, env, ctx)`) & inbound webhook
- Authenticated Cloudflare Workers AI drafting

## Frontend UI & Architecture
- **Single Page Application**: `index.html` serves as the primary SPA host containing the unified production UI (Inter + Instrument Serif, warm cream `#f8f5e9` and off-white `#fcfaf4`, rounded card surfaces, purple-to-orange gradient `#8B5CF6` -> `#FB923C`).
- **Complete Views Implemented**:
  - Sign-in with real credential authentication (`POST /auth/v1/token`), password reset modal, show/hide password toggle, and enterprise SSO triggers.
  - MailDesk workspace: Fixed desktop sidebar, mobile drawer bottom sheet (`#bottom-sheet`), live-sync inbox (`#email-list`), real-time search filtering (`#search-input`), Sent folder (`#sent-view`), Trash folder (`#trash-view` with Empty Trash), and Profile Settings (`#profile-view`).
  - Production Email Composer Modal (`#composer`): Connected to real `POST /emails` with recipient validation, subject, and HTML editor.
  - Raw HTML Viewer Modal (`#raw-html-modal`): Real-time sandboxed iframe preview, syntax-highlighted raw HTML `<pre>`, and one-click copy to clipboard.
  - AI HTML Generator (`#templates-view`): Connected to real `POST /ai/draft` (Cloudflare Workers AI), loads generated HTML directly into editor with live iframe preview.
- **Removed Artifacts**: Old redirect files (`login_page.html`, `mailbox_pages.html`, `dashboard.html`, `operava-maildesk-backend-stack.html`) removed from the repository.

## Worker routes
| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | /health | Public | Health, delivery provider, and request correlation |
| POST | /auth/v1/token | Public | Authenticate user with Cloudflare Worker Native Auth (PBKDF2/JWT) |
| GET | /auth/v1/user | Cloudflare user | Validate token and return user identity |
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
3. Supabase Auth fallback when `SUPABASE_URL` is configured.

## Outbound Email
`POST /emails` delivers messages using ZeptoMail REST API (`https://api.zeptomail.com/v1.1/email`) via `ZEPTOMAIL_API_KEY` and `ZEPTOMAIL_FROM_ADDRESS`, with Resend fallback if configured. Missing provider configuration returns structured 503 error.

PATCH supports `is_read`, `is_starred`, `is_archived`, and `is_deleted` after migration 0006.

## Authentication
The browser authenticates directly with Supabase Auth and sends the access token to the Worker. The Worker validates the token using Supabase Auth. Normal database access uses the user's authorization context so RLS remains authoritative. There is no Worker ADMIN_EMAIL/ADMIN_PASSWORD login.

## Database
- 0001: emails, email_events, mailbox_status, RLS, Realtime publication.
- 0005: direction and from_address for inbound/outbound representation.
- 0006: mailbox flags plus thread/folder/attachment metadata foundations.

Threads, folders, and attachment tables are foundations only; their UI/API workflows are still planned.

## AI drafting
`POST /ai/draft` accepts a required `instruction` (1-4000 characters) and optional `source` text (up to 20000 characters). It calls the server-side Workers AI binding using `AI_MODEL` and returns draft text only. It cannot send email, change mailbox state, or bypass RLS. Missing bindings/provider failures return structured errors rather than fake output.

## Email lifecycle
POST /emails validates the recipient, subject, and body, inserts a queued record, calls Resend with the email UUID as idempotency key, then stores success/failure state. The webhook stores signed provider events idempotently. Current status mapping explicitly handles email.sent, email.bounced, and email.complained.

## Realtime
The database publishes `emails` to Supabase Realtime. The browser still does not subscribe, so live/push mailbox updates are not implemented.

## Inbound
Migration 0005 provides schema fields for inbound records, but a complete production inbound ingestion route is not implemented on the authoritative Worker and must not be described as live.

## Attachments
Migration 0006 provides attachment metadata only. There is no production Storage bucket/upload/download workflow yet.

## Validation
`node --check app.js`
`node --check worker/src/index.js`

These are syntax checks. Use `docs/operations.md` for staging smoke testing.

## Documentation rule
Code and migrations are authoritative. Update this document, `llms.txt`, API/deployment docs, and architecture status whenever implementation changes.
