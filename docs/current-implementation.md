# OPERAVA MailDesk — Current Implementation

## Purpose
This is the source-of-truth description of behavior implemented in source code on this branch. Target/planned architecture is documented separately in `docs/architecture.md`.

## Stack
- Static HTML/CSS/JavaScript frontend on Cloudflare Pages
- Supabase Auth email/password authentication
- Cloudflare Worker API
- Supabase Postgres + Row Level Security
- Resend outbound email
- Signed Resend webhook ingestion
- Authenticated Cloudflare Workers AI drafting

## Worker routes
| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | /health | Public | Health/request correlation |
| POST | /webhooks/resend | Signed webhook | Persist provider event and supported status transition |
| GET | /me | Supabase user | Return validated user identity |
| POST | /ai/draft | Supabase user | Generate draft text with Workers AI; no mail/data mutation |
| GET | /emails | Supabase user | List RLS-visible emails |
| GET | /emails/:id | Supabase user | Read one RLS-visible email |
| POST | /emails | Supabase user | Validate, create, and send email through Resend |
| PATCH | /emails/:id | Supabase user | Update supported mailbox flags |

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
