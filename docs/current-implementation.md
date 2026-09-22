
# OPERAVA MailDesk — Current Implementation

## Purpose

This document is the source-of-truth description of what the repository currently implements.

The application is a static, garden-themed email workspace with Supabase authentication, a Cloudflare Worker API, Supabase Postgres/RLS, and Resend email delivery.

## Frontend

Production entry point:
- index.html
- app.css
- app.js

Current user-facing capabilities:
- email/password sign-in
- authenticated session
- mailbox message list
- status/filter views currently exposed by the UI
- compose message
- send message
- sign out
- responsive MailDesk presentation
- OPERAVA logo/brand asset

The browser calls Supabase Auth directly for authentication and sends the resulting access token to the Worker for protected API requests.

## Worker

Source: worker/src/index.js

Current routes:

| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | /health | No | Health check |
| POST | /webhooks/resend | Signed webhook | Store Resend event |
| GET | /emails | Supabase user | List current user's emails |
| POST | /emails | Supabase user | Send email through Resend |

The Worker uses the Supabase service-role credential for server-side webhook persistence after signature validation. Normal mailbox operations are authenticated against Supabase Auth and use the user's authorization context for database access.

## Email lifecycle

1. POST /emails validates the authenticated user and required send fields.
2. An email record is created.
3. The Worker calls Resend.
4. The Resend identifier is stored when available.
5. The message record is updated with the send result.
6. Resend can send signed webhook events to POST /webhooks/resend.
7. Accepted webhook payloads are stored in email_events.

The current webhook mapping explicitly handles email.sent, email.bounced, and email.complained for mailbox status updates. Other accepted event payloads are stored as events when the Worker receives them, but the current source should not be described as a complete mailbox tracking system.

## Database

Migration: supabase/migrations/0001_maildesk.sql

Current primary objects:
- mailbox_status
- emails
- email_events

The emails table belongs to an authenticated Supabase user through user_id.

RLS is enabled on the application tables. User-owned email records are restricted by the authenticated user identity.

## Realtime

The database migration adds emails to the Supabase Realtime publication.

However, the current app.js does not subscribe to Realtime events.

Database capability: enabled.
Active frontend behavior: not implemented.

Do not document the application as having live/push mailbox updates until the frontend subscription is added.

## Storage and attachments

No production attachment workflow is currently implemented.

Do not describe Supabase Storage, attachment buckets, or attachment upload APIs as active features.

## Boards and sticky notes

No production board/sticky-note implementation is currently present.

References to /boards/*, sticky_notes, or board image upload in historical artifacts are design/reference material, not current API functionality.

## Deployment

The intended deployment shape is:

Cloudflare Pages → browser → Cloudflare Worker → Supabase / Resend

Public browser configuration:
- Supabase project URL
- Supabase anon key
- Worker URL

Server-only configuration:
- Supabase service-role key
- Resend API key
- Resend sender
- Resend webhook secret
- Worker frontend-origin allowlist

## Validation

Current lightweight checks:

    node --check app.js
    node --check worker/src/index.js

These are syntax checks, not a full end-to-end test suite.

## Documentation policy

If code is changed, update this document and llms.txt so coding agents do not implement against stale reference material.

If a feature is planned but not implemented, label it Planned rather than Implemented.
