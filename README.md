
# OPERAVA MailDesk

OPERAVA MailDesk is a lightweight, garden-themed email workspace for authenticated users. This repository documents the implementation that is currently in the repository; it does not claim features that are not implemented.

## Current implementation

- Static frontend: index.html, app.css, app.js
- Authentication: Supabase Auth email/password sign-in
- API: Cloudflare Worker in worker/src/index.js
- Database: Supabase Postgres with Row Level Security
- Email delivery: Resend API, called server-side by the Worker
- Delivery events: signed Resend webhook ingestion into email_events
- Mailbox: list/filter messages and send new messages
- Configuration: browser receives only public Supabase URL/anon key and Worker URL
- Brand asset: operava_exact_transparent.png

## Implemented user flow

1. User opens the static MailDesk application.
2. User signs in with Supabase email/password authentication.
3. The browser uses the authenticated access token when calling the Worker.
4. The Worker verifies the user with Supabase Auth.
5. Authenticated mailbox requests are scoped through Supabase RLS.
6. Sending a message creates an emails record, calls Resend, and records the resulting delivery identifier/status.
7. Resend webhook events are signature-checked by the Worker and stored in email_events.

## Repository map

| Path | Purpose |
| --- | --- |
| index.html | Production browser entry point. |
| app.css | Production MailDesk styling and responsive layout. |
| app.js | Login, session handling, mailbox loading, filtering, compose, send, and sign-out behavior. |
| app-config.js | Public browser configuration template. Never place server secrets here. |
| operava_exact_transparent.png | OPERAVA brand/logo asset. |
| worker/src/index.js | Cloudflare Worker API, authentication checks, Resend sending, and webhook processing. |
| worker/wrangler.toml | Worker deployment configuration. |
| worker/.dev.vars.example | Local development secret/configuration example. |
| supabase/migrations/0001_maildesk.sql | Current database schema, indexes, RLS policies, and Realtime publication. |
| DEPLOYMENT.md | Deployment and environment configuration for the current implementation. |
| llms.txt | Machine-readable implementation reference for coding agents. |
| docs/current-implementation.md | Human-readable implementation reference and boundary between current and planned functionality. |

## API currently implemented

Public:
- GET /health — Worker health check.
- POST /webhooks/resend — signed Resend webhook ingestion.

Authenticated:
- GET /me — return the validated signed-in user identity.
- GET /emails — retrieve the signed-in user's messages.
- GET /emails/:id — retrieve one RLS-visible message.
- POST /emails — validate and send a message through Resend.
- PATCH /emails/:id — update read/star/archive/delete mailbox flags.

The current Worker does not implement /boards/*, attachment upload routes, or an authentication proxy route.

## Database currently implemented

The migration set currently provides:
- emails
- email_events
- mailbox_status
- inbound/outbound message fields (0005)
- mailbox flags plus thread/folder/attachment metadata foundations (0006)

RLS protects user-owned records. Migration 0006 creates thread, folder, and attachment-metadata foundation tables with RLS. It does not create profiles, templates, sticky notes, boards, an attachment Storage bucket, or live thread/folder/attachment UI workflows.

## Local checks

    node --check app.js
    node --check worker/src/index.js

These checks validate JavaScript syntax only. They are not a complete production integration test.

## Security boundary

Server-only credentials belong in Cloudflare Worker secrets and must never be committed to browser files:
- Supabase service-role key
- Resend API key
- Resend webhook signing secret

The Supabase anon key and project URL are public browser configuration values. Keep the Worker CORS allowlist restricted to the intended frontend origin(s).

## Documentation rule

When implementation changes, update llms.txt, docs/current-implementation.md, and the relevant deployment documentation in the same change. Documentation must describe the code that exists; future capabilities must be explicitly marked as planned.

## Reference artifacts

login_page.html, mailbox_pages.html, and operava-maildesk-backend-stack.html are retained as historical/visual reference artifacts. They are not authoritative implementation specifications. Examples inside those files may describe architecture or routes that are not present in the current source code.

The production entry point is index.html.


## Architecture documentation

- docs/architecture.md — target architecture and delivery phases.
- docs/current-implementation.md — behavior actually implemented on the branch.
- docs/api.md — Worker API contract.
- docs/database.md — schema/migration ownership and compatibility.
- docs/security.md — trust boundaries, secrets, and hardening requirements.
- docs/operations.md — deployment smoke checks, incident triage, and rollback guidance.

Schema foundations marked as planned are not automatically live product features.
