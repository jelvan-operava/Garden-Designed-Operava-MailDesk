# OPERAVA MailDesk Operations Runbook

## Pre-deploy
1. Run database migrations in staging.
2. Verify Worker secrets and CORS allowlist.
3. Run `node --check app.js` and `node --check worker/src/index.js`.
4. Exercise login, GET /me, mailbox list, send, message detail, flag update, sign-out, and webhook signature handling in staging.
5. Confirm no server secret appears in browser assets.

## Deploy order
1. Database migrations.
2. Cloudflare Worker.
3. Cloudflare Pages/browser configuration.
4. Resend webhook endpoint/configuration.

## Smoke checks
- GET /health returns ok.
- Invalid protected request returns 401.
- Authenticated GET /me returns expected user.
- GET /emails is scoped to the signed-in user.
- Send creates one email and one provider request.
- Signed webhook is accepted; invalid signature is rejected.
- PATCH /emails/:id cannot mutate another user's record.

## Incident triage
Correlate `x-request-id`, email UUID, Resend message ID, and webhook event ID. Check Worker logs and database rows without copying credentials or message bodies into tickets.

## Rollback
Application code can be rolled back independently. Database migrations should be treated as forward-compatible; avoid destructive rollback in production. Disable new UI/API behavior first, then ship a corrective migration when schema repair is required.
