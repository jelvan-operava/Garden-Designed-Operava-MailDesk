# OPERAVA MailDesk Security

## Trust model
The browser is untrusted. Supabase Auth establishes user identity. Postgres RLS enforces ownership. The Worker holds provider/server secrets and validates signed webhooks.

## Secret classification
Never commit or expose: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_WEBHOOK_SECRET. RESEND_FROM and FRONTEND_URL are server configuration. SUPABASE_URL and SUPABASE_ANON_KEY are browser-safe public configuration.

## Controls
- Exact CORS origin allowlist from FRONTEND_URL.
- Bearer token validation through Supabase Auth.
- RLS for user-owned rows.
- Service role only for trusted webhook persistence.
- Resend/Svix HMAC signature validation with 5-minute replay window.
- Idempotent outbound send key based on email UUID.
- Idempotent webhook event storage.
- Input validation and body limits.
- Request correlation through x-request-id.

## Required production hardening
Before exposing the service broadly, add edge rate limiting, Content-Security-Policy on Pages, automated dependency/security scanning, integration tests against staging, log retention/redaction policy, backup/restore testing, and an incident response owner.

## Logging rules
Allowed: request ID, method, route, status, duration, user UUID, email UUID, provider message/event ID, error code.
Forbidden: passwords, JWTs, refresh tokens, service-role keys, Resend API keys, webhook secrets, full sensitive message bodies.

## Attachment requirements
Attachment binary handling is not live. Before enabling it: direct-to-storage upload, per-user paths, RLS/storage policies, MIME allowlist, size cap, filename normalization, malware scanning decision, and download authorization.
