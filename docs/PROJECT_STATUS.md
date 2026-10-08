# Sapiver Poster Gen — current handover

## 2026-10-08: Canva OAuth callback scaffold

Repository initialised with a minimal README on main. Working branch: feature/canva-oauth-callback.

Implemented:
- HTTPS-pinned callback address and password-protected start form.
- OAuth 2.0 Authorization Code + SHA-256 PKCE with a separate CSRF state.
- 10-minute encrypted Secure/HttpOnly/SameSite=Lax browser session cookie.
- Server-only code exchange and encrypted token record in private site-wide Netlify Blobs.
- Default-deny if configuration missing; no tokens returned to the browser.
- Local tests for OAuth helper logic.
- No writes to Sapiver Press sites.

NOT implemented: design exports, refresh-token rotation, Etsy publishing, PrintShrimp fulfilment, print-file storage and automatic product synchronisation.

Required before authorisation: create/connect a dedicated Netlify project, set its four environment variables with Functions scope, deploy branch, register exact callback URL in Canva, then perform real interactive OAuth testing.

Security notes: client-secret rotation requires Canva re-authorisation; GitHub Actions secrets are NOT implicitly available to a Netlify runtime. This public repository must not contain API secrets, customer data or high-resolution master artwork.

Next: verify tests; deploy isolated Netlify callback; authorise once; then build a single-writer refresh mechanism and audited Canva exporter before listing/fulfilment work.
