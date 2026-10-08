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

## Netlify project reserved (2026-10-08)

- Project name: sapiver-poster-gen-auth.
- Netlify project ID: d1753fca-2098-4b96-a684-75921df7c3da.
- Target origin: the value of the Netlify environment variable CANVA_SITE_ORIGIN (not copied into the public repo).
- Required Canva redirect: append /canva/callback to CANVA_SITE_ORIGIN.
- **The project is newly created and NOT deployed or connected to GitHub yet.** The target redirect is NOT live until a successful deploy.
- Tests checked using a local Node 22 copy with Git blob hashes verified against GitHub: all 4 OAuth helper tests passed. Server function passes node --check with matching Git blob hash. **Real Netlify build and Canva OAuth exchange remain untested.**
- Manual steps remaining: Netlify UI link repository and select feature branch; add CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, CANVA_SETUP_PASSWORD (8+ unique characters) and CANVA_SITE_ORIGIN in Netlify environment with Functions scope; deploy; add redirect in Canva; authorise once.

## 2026-10-08 — Deploy diagnostic

The first deployment after saving environment variables failed. Investigation identified that CANVA_SITE_ORIGIN was marked as a secret and its exact value had been copied into this public status document. Netlify scans repositories and build output for configured secret values and can fail the deploy on a match. Removed this unnecessary literal while preserving the formula for finding the redirect. Confirm the next deploy logs to verify whether secret scanning was the actual failure mechanism; do not disable scanning or expose credential values.

## 2026-10-08 — Shorter setup password

User declined 20-character minimum, which was custom application policy, not required by Canva. Lowered the minimum to 8 characters while adding function-level Netlify per-IP rate limiting (6 requests per 180 seconds across the onboarding and callback routes). Tests added for length boundaries. This is a one-time onboarding credential, not the Canva account password; it must be unique and not reused from the previously exposed screenshot. Verify the deployed rate-limit rule in Netlify post-processing logs. Publishing and manufacturing remain disabled.

## 2026-10-08 — Form submission browser compatibility

On mobile browser the setup form displayed "Invalid request origin" even though the server had all four environment variables. The previous code required the HTTP Origin header to equal the configured origin for every form POST; browsers/webviews can omit or null the header.

Updated the form GET to set a Secure/HttpOnly/SameSite=Lax 10-minute encrypted CSRF cookie, with a separate random hidden challenge field. POST requires the field to match the encrypted cookie and not be expired; cross-site fetch metadata or an explicit different Origin is still rejected. Cookies are invalidated on successful submission. Existing PKCE and OAuth state validation remain unchanged. Added unit tests for expired/tampered cookies, absent Origin and cross-origin requests. No password, credential or Canva permission changes were made.

The deployed test must confirm the user can submit the password and reach the Canva authorization page. The Canva redirect URL also needs to be registered in the developer app. Live Canva token exchange and persistence remain untested. No Etsy or PrintShrimp integration is enabled.
