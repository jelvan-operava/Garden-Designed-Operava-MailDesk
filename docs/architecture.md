# OPERAVA MailDesk — Architecture

## Status
This document defines the target architecture and explicitly separates implemented behavior from planned behavior. `docs/current-implementation.md` remains the source of truth for what is live today.

## Principles
1. Supabase Auth is the only end-user authentication authority.
2. The browser never receives service-role, Resend, or webhook secrets.
3. User-owned data is protected by Postgres Row Level Security.
4. Cloudflare Worker is the trusted integration boundary for provider APIs and webhooks.
5. Provider webhooks are authenticated, idempotent, and persisted before state transitions.
6. Database migrations are additive and reversible where practical.
7. Documentation changes ship with implementation changes.
8. Production paths never substitute mocks/demos/fake success for unavailable dependencies.
9. Existing OPERAVA design/theme is a product contract; implementation work preserves it unless an explicit redesign is approved.
10. AI inference uses Cloudflare Workers AI through the server-side AI binding; model output never bypasses deterministic authorization or validation.

## System
```text
Cloudflare Pages
  Browser UI
    |-- Supabase Auth (email/password)
    |-- Worker API (Bearer JWT)
             |
             |-- Supabase Postgres / RLS
             |-- Resend outbound email
             |-- Resend signed webhooks
             `-- future: Supabase Storage attachments

Supabase Realtime
  `-- emails publication (database enabled; browser subscription planned)
```

## Security boundaries
### Browser-safe
- SUPABASE_URL
- SUPABASE_ANON_KEY
- public Worker URL

### Server-only
- SUPABASE_SERVICE_ROLE_KEY
- RESEND_API_KEY
- RESEND_FROM
- RESEND_WEBHOOK_SECRET
- FRONTEND_URL allowlist

## Domain model
### Current
- emails: user-owned outbound/inbound message record
- email_events: immutable provider event payloads
- mailbox_status: draft, queued, sent, failed, archived, trash
- direction: outbound/inbound (added by migration 0005)

### Foundation added by migration 0006
- email flags: is_read, is_starred, is_archived, is_deleted
- body metadata: text_body, reply_to, received_at
- threads: conversation grouping foundation
- folders: user-defined/system folder foundation
- attachments: metadata foundation; binary upload is NOT implemented

These additions are intentionally backward compatible with the current UI and Worker.

## Request flow
### Authenticated API
Browser obtains a Supabase access token, sends it as `Authorization: Bearer <token>`, and the Worker validates it with Supabase Auth. Database requests use the user's JWT so RLS remains authoritative.

### Outbound email
1. Validate authenticated user and request.
2. Insert queued email row.
3. Send with Resend using email UUID as idempotency key.
4. Persist provider ID and status.
5. Receive signed Resend events and append to email_events.
6. Apply supported delivery state transitions.

### Inbound email
Migration 0005 provides inbound schema fields. A complete inbound ingestion route is planned and must not be described as live until implemented and tested.

## API evolution
Current production-compatible routes:
- GET /health
- GET /me
- GET /emails
- GET /emails/:id
- POST /emails
- PATCH /emails/:id
- POST /webhooks/resend

PATCH /emails/:id supports mailbox flags only: `is_read`, `is_starred`, `is_archived`, `is_deleted`.

Planned:
- threads endpoints
- folder CRUD
- draft-specific endpoints
- attachment authorization/upload flow
- search endpoint
- inbound webhook ingestion

## Attachment architecture (planned)
The Worker should authorize uploads; large file bytes should go directly from the browser to Supabase Storage. The database stores only attachment metadata. Storage paths should be scoped as `{user_id}/{email_id}/{uuid}-{filename}`. MIME, size, ownership, and filename must be validated.

## Search architecture (planned)
Start with PostgreSQL full-text search over subject, sender/recipient metadata, and text body. Add a generated/search vector and GIN index only when the UI endpoint is implemented.

## Observability
Every Worker response includes an `x-request-id`. Structured logs should include request ID, route, method, status, user ID when available, email ID/provider ID when relevant, and duration. Never log passwords, bearer tokens, API keys, service-role keys, or full message bodies.

## Delivery phases
1. Foundation: documentation, configuration consistency, request IDs, validation, mailbox flags, schema foundations.
2. Mailbox: message detail, read/unread, star, archive/trash, Realtime subscription.
3. Mail system: inbound email, threads, reply/reply-all/forward, attachments.
4. Productivity: search, templates, signatures, bulk actions.
5. Operations: rate limiting, audit events, staging, E2E tests, recovery procedures.
