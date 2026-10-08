# Sapiver Poster Gen

Dedicated integration project for Sapiver Prints, isolated from existing Sapiver Press sites.

## Current scope

Only a Canva OAuth callback is prepared on branch feature/canva-oauth-callback. No Etsy publishing, PrintShrimp manufacturing, website deployments, or automatic Canva artwork export are implemented.

## Netlify configuration

Connect this repository to a **new dedicated Netlify project**, using branch feature/canva-oauth-callback. Publish directory: public. Functions directory: netlify/functions.

Set these Netlify environment variables with Functions scope:
- CANVA_CLIENT_ID — Canva app's Client ID.
- CANVA_CLIENT_SECRET — Canva app's Client Secret.
- CANVA_SETUP_PASSWORD — separate randomly generated password of 8+ characters.
- CANVA_SITE_ORIGIN — exact Netlify site HTTPS origin, with no trailing slash.

The GitHub Actions secrets are NOT automatically visible to Netlify Functions. Configure these values in Netlify too, without pasting them into the repository or chat.

Register this exact Canva Redirect URL once the Netlify site is deployed:
CANVA_SITE_ORIGIN/canva/callback

Use the Canva permissions design:content:read, design:meta:read, folder:read only.

To connect: visit CANVA_SITE_ORIGIN/canva/start, supply the separate setup password, and approve Canva access. After the token exchange succeeds, tokens are encrypted and saved to a site-wide Netlify Blobs store. They never appear in the browser.

The application client secret derives the encryption key: rotating it makes previously saved tokens unreadable and requires reconnecting. Canva refresh tokens rotate and can only be used once, so implement a concurrency-controlled refresh workflow before automatic exports.

Run npm test to verify the core helpers. See docs/PROJECT_STATUS.md for full handover and unverified steps.

Setup password: 8+ characters, unique and never reused from a screenshot or another service. Netlify function rate limiting is configured to 6 requests per IP per 180 seconds, including callback visits; check Netlify deploy post-processing logs to verify the rule was applied.
