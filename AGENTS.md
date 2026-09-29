# OPERAVA MailDesk — Production AI Agent Instructions

These instructions apply to every AI coding/deployment agent working in this repository.

## Non-negotiable production rule
This repository is a production application. Do not create mock, demo, sample, placeholder, fake, simulated, preview-only, or disconnected implementations in production paths. Do not hard-code fake users, messages, API responses, authentication state, delivery state, or AI output.

If a required production integration is unavailable, fail clearly and document the missing deployment dependency. Never silently replace it with mock data.

## Source of truth
1. Running source code and database migrations.
2. `docs/current-implementation.md` for implemented behavior.
3. `docs/architecture.md` for target architecture.
4. `docs/design-system.md` for visual/product invariants.
5. `DEPLOYMENT.md` and `docs/cloudflare-ai-deployment.md` for deployment.

Never claim a planned feature is live.

## Existing design is authoritative
Preserve the existing OPERAVA MailDesk visual language unless the task explicitly requests a redesign:
- warm cream garden background
- off-white cards/surfaces
- charcoal/slate text
- purple-to-orange OPERAVA accent gradient
- Georgia/editorial display headings
- Inter/system sans-serif application text
- rounded cards, restrained borders and soft shadows
- current spacing, responsive behavior, navigation structure, and OPERAVA brand assets

Do not replace the existing UI with a generic dashboard, Tailwind starter, component-library default, glassmorphism template, or unrelated design system. Extend existing CSS variables/classes before introducing new visual primitives.

## Production integrations
- Authentication: Supabase Auth only.
- Authorization/data ownership: Supabase RLS.
- Database: Supabase Postgres.
- Email delivery: Resend from the Worker.
- Provider events: verified signed webhooks.
- AI inference: Cloudflare Workers AI through the `AI` binding (`env.AI`).
- Frontend hosting: Cloudflare Pages.
- Server/API: Cloudflare Worker.

Secrets stay server-side. Never put service-role, Resend, webhook, Cloudflare API, or other secret tokens into browser files.

## Cloudflare Workers AI
The Worker already declares:
```toml
[ai]
binding = "AI"
```
Use `env.AI.run(model, input)` from Worker code. Do not call a fake local AI endpoint and do not expose an unrestricted public AI proxy.

Any AI route must:
- require the same Supabase authentication model unless it is explicitly a provider webhook
- validate and size-limit inputs
- use an explicit production model identifier
- return structured errors and request IDs
- avoid logging message bodies, prompts containing sensitive mail content, JWTs, or secrets
- keep model choice configurable server-side where practical
- treat model output as untrusted data; validate structured output before actions
- never send email, delete data, or perform another irreversible action solely because an LLM generated an instruction

## Change discipline
Every implementation change must update the relevant docs in the same branch. New database behavior requires a numbered migration. New Worker routes require API documentation. New bindings/secrets require deployment documentation.

Before deployment run syntax/tests available in the repo and execute the production smoke checklist. If automated coverage does not exist for the changed path, state that explicitly; do not claim it passed.

## Forbidden shortcuts
- mock/demo/sample production data
- auth bypasses or fake local sessions
- client-side secret keys
- fake successful API responses
- placeholder endpoints represented as live
- duplicate parallel authentication systems
- destructive schema edits without migration
- visual redesign incidental to backend/AI work
- AI-generated actions without deterministic authorization/validation
