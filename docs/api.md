# OPERAVA MailDesk API

Base URL: deployed Cloudflare Worker URL.

## Authentication
Protected routes require `Authorization: Bearer <Supabase access token>`.

## Response conventions
JSON responses use `content-type: application/json`. Worker application responses include `x-request-id` for correlation. Errors use:
```json
{"error":{"code":"INVALID_REQUEST","message":"Human-readable message","requestId":"..."}}
```

## GET /health
Public. Returns service health.

## GET /me
Authenticated. Returns the validated Supabase user's id and email.

## POST /ai/draft
Authenticated. Generates draft text through the configured Cloudflare Workers AI binding. Body:
```json
{"instruction":"Write a concise follow-up","source":"Optional source text"}
```
`instruction` is required and limited to 4000 characters; `source` is optional and limited to 20000 characters. The route returns draft text only and performs no email send or data mutation. Provider/binding failures return structured 5xx/503 errors; no fake fallback is used.

## GET /emails
Authenticated. Lists rows visible to the user through RLS, newest first.

## GET /emails/:id
Authenticated. Returns one RLS-visible email. Returns 404 when unavailable.

## POST /emails
Authenticated. Body:
```json
{"to":"person@example.com","subject":"Subject","html":"<p>Message</p>"}
```
Limits: valid email address, subject <= 998 characters, HTML body <= 500000 characters. Creates a queued record, sends via Resend, then stores the provider result.

## PATCH /emails/:id
Authenticated. Updates mailbox flags only:
```json
{"is_read":true,"is_starred":false,"is_archived":false,"is_deleted":false}
```
Unknown fields are ignored; at least one supported boolean field is required.

## POST /webhooks/resend
Public endpoint authenticated by Svix/Resend signature. Rejects stale timestamps and invalid signatures. Stores provider events idempotently. Supported mailbox status transitions currently include sent, bounced, and complained.

## Planned, not live
Threads, folder CRUD, attachments, search, drafts API, and inbound webhook ingestion.


## CORS
Preflight allows GET, POST, PATCH, and OPTIONS. Allowed origins are exact matches from the comma-separated `FRONTEND_URL` configuration. Protected browser calls may send `authorization` and `content-type` headers.
