# Cloudflare Workers AI — Production Deployment

## Architecture
OPERAVA MailDesk uses the Cloudflare Workers AI binding. `worker/wrangler.toml` declares:
```toml
[ai]
binding = "AI"
```
At runtime the binding is available as `env.AI`. AI inference must run server-side in the Worker, never by exposing Cloudflare credentials to the browser.

## Production rule
Workers AI is a real production dependency. Do not implement a mock AI service, fake response generator, demo endpoint, or client-only simulation. If the binding/model is unavailable, return a structured service error and keep the application action unperformed.

## Model configuration
Use a server-side `AI_MODEL` variable for the selected production model. Confirm the model still exists in Cloudflare's current model catalog before changing it. Do not scatter model IDs through browser code.

Example runtime pattern:
```js
const result = await env.AI.run(env.AI_MODEL, {
  messages: [
    { role: "system", content: "..." },
    { role: "user", content: userInput }
  ]
});
```

## Deployment with Wrangler
From `worker/`:
```bash
npx wrangler login
npx wrangler deploy
```
The `[ai]` binding in Wrangler is deployed with the Worker. No Cloudflare AI API token should be exposed to the browser when using the Worker binding.

## Required verification
After deployment:
1. `GET /health` succeeds.
2. Supabase-authenticated API calls succeed.
3. Any implemented AI route rejects unauthenticated requests.
4. A real inference request succeeds through `env.AI`.
5. Invalid/oversized AI input returns a deterministic 4xx error.
6. AI provider/binding failure returns a deterministic 5xx/503 error, not fake output.
7. Logs contain request IDs but not raw sensitive mail bodies, JWTs, passwords, or secrets.
8. AI-generated structured data is schema-validated before use.

## Safety boundary for mail actions
AI may assist with text or propose structured actions, but deterministic application code remains responsible for authorization, recipient validation, database ownership, and provider calls. AI output must never directly bypass RLS or trigger an irreversible mail/data action without the product's explicit confirmation/authorization flow.

## Local development
Workers AI usage through the binding can contact Cloudflare infrastructure and may incur usage. Local behavior must not be replaced with a fake model response merely to make development appear successful. If a developer cannot access Workers AI, the AI-dependent path should fail clearly while non-AI MailDesk functionality continues to work.

## Operations
Track AI route latency/failures by request ID. Consider AI Gateway when production requirements call for centralized observability, rate limiting, retries, or model routing. Adding AI Gateway is an architectural change and must be documented before being treated as live.
