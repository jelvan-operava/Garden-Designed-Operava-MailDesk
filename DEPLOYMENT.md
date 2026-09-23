# Deploy OPERAVA MailDesk

## Architecture

- /login is the only login screen and is served by login_page.html.
- /mailbox is the authenticated MailDesk application.
- Authentication is Supabase Auth email/password.
- The browser stores the Supabase session under operava-maildesk-session.
- The mailbox validates the access token against Supabase Auth before displaying the application.
- The Worker validates the same Bearer access token before /emails access.
- Resend API credentials and Supabase service-role credentials remain Worker-side secrets.

## Supabase

1. Enable Email/password authentication.
2. Create the authorized MailDesk users.
3. Apply supabase/migrations/0001_maildesk.sql.
4. Keep service-role/secret keys server-side only.

## Browser configuration

Set the public values in app-config.js:
- supabaseUrl: Supabase project URL.
- supabaseAnonKey: browser-safe Supabase anon/publishable key.
- apiBaseUrl: deployed Worker URL.

Never put the Supabase service-role/secret key, Resend API key, or webhook secret in this file.

## Cloudflare Worker

From worker/:
    npm install
    npx wrangler login
    npx wrangler secret put SUPABASE_URL
    npx wrangler secret put SUPABASE_ANON_KEY
    npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
    npx wrangler secret put RESEND_API_KEY
    npx wrangler secret put RESEND_FROM
    npx wrangler secret put RESEND_WEBHOOK_SECRET
    npx wrangler secret put FRONTEND_URL
    npm run check
    npm run deploy

## Cloudflare Pages

Use the repository root as the static output. No framework build command is required.

Routes:
- / -> /login
- /login -> login_page.html
- /mailbox -> mailbox.html

## Authentication test

1. Open /login.
2. Sign in with a real Supabase Email/password user.
3. Confirm operava-maildesk-session is created.
4. Confirm /mailbox validates the access token.
5. Confirm Worker API requests use the same Bearer token.
6. Sign out and confirm the session is cleared and the browser returns to /login.

The old auth=1, logged_in=1, cookie login, fake session, and /api/auth/login/logout bypasses are no longer part of the authentication model.

## Secrets

Never commit Supabase service-role/secret keys, Resend API keys, Resend webhook signing secrets, or .dev.vars.