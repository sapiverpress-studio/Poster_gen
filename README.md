# Sapiver Poster Gen

Dedicated Canva-to-print artwork workflow for Sapiver Prints, isolated from other Sapiver Press projects.

## START HERE — mandatory

1. **Read [AGENTS.md](AGENTS.md)** before doing any work. It requires every development, design, deployment and significant investigation to be documented in the same work item.
2. **Read [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)**, starting with its **CURRENT PROJECT SNAPSHOT** and latest dated history.
3. Inspect the active GitHub branch, Netlify costs/deployment status and actual code. Do not assume a prior chat's statements are still current.

**The status document is the authoritative living handover**: current stage, verified results, pending work, blockers, risks, detailed change history, next action and release restrictions.

## Current product and progress

**Dinosaurs Across Time** is a separate Canva product from `Dinosaurs of the World`. The user sells only **A5, A4 and A3** posters.

- Original Canva design: `DAHXUnmHofY` (do not change).
- A3 working copy: `DAHXb1PdJlM` (3508 × 4961 px).
- Canva OAuth works; asynchronous PNG export to private Netlify storage works.
- User's live A3 export report showed correct dimensions, paper ratio, 300 PPI at A3, 424 PPI at A4 and 600 PPI at A5, under the reported PrintShrimp upload limit.
- **Done:** owner-approved A3 background correction saved directly in Canva; scheduled PNG export succeeded unattended (3508 × 4961, 37.4 MiB), stored privately. **Pending:** visual/colour/trim QA, Etsy draft and PrintShrimp match, sample proof.
- **Live:** scheduled export for the approved revision and private owner report. **Staged off production:** one-master shared-SKU A5/A4/A3 mapping (43 passing tests). **Staged:** Etsy seller connection, token refresh, unpublished draft creation and one-master supplier transfer. Orders and publishing are disabled; live merchant integration still requires verification.

## Code locations

- `netlify/functions/canva-oauth.mjs` — password-protected Canva OAuth flow.
- `netlify/functions/canva-print-check.mjs` — private PNG export, job-status and download routes.
- `lib/oauth.mjs` and `lib/print-check.mjs` — shared security/export and image/PPI checks.
- `test/*.test.mjs` — regression tests (run `npm test`; Node 20+).
- `netlify.toml` — publishes `public` and `netlify/functions`.

## Release, costs and secrets

The Netlify-linked production branch is `feature/canva-oauth-callback`, currently deployed successfully at `fe2c128` with scheduled Canva export running. The earlier secret-scanner failure was corrected without disabling security scanning. Subsequent PrintShrimp mapping and this handover remain on isolated branch `docs/handover-and-change-policy-20261008`.

The team's October billing screen showed substantial production deployment credit usage. **Never push changes to a production-deployed branch, trigger a deployment, change automatic builds, merge or spend deployment credits without the owner's explicit release approval.** Group tested changes into one controlled release.

Never commit Canva client credentials, passwords, tokens, private PNGs, signed export links, customer data or stored cookies. Configuration is kept privately in Netlify environment variables and Blobs.

No automatic Etsy publication or PrintShrimp manufacturing order without the owner's explicit approval.

**Future chats:** open the repository at the branch containing the latest handover and read `AGENTS.md` and `docs/PROJECT_STATUS.md` before attempting edits. The repository files do not automatically appear in every ChatGPT conversation; you must explicitly inspect them.

## PrintShrimp handoff

See docs/PRINTSHRIMP_HANDOFF.md. **Owner-selected order: prepare an Etsy draft FIRST**, using one shared SKU for A5/A4/A3; then upload the **one** existing private A3 master to PrintShrimp under that same SKU, verify fulfilment, and publish only after separate approval. SKU mapping is staged only; no seller listing or supplier upload has occurred.

## Etsy seller authorisation (staged)

`lib/etsy-oauth.mjs` and `netlify/functions/etsy-oauth.mjs` implement `/etsy/start` → Etsy PKCE → `/etsy/callback`, encrypted token storage and exact SapiverPrints seller verification. 71 local tests pass across the full workflow; real seller flow not yet deployed or exercised. See `docs/ETSY_CONNECT.md` for runtime key-pair configuration and exact redirect registration. Existing GitHub keys have already passed live Etsy app authentication (HTTP 200). Draft creation and supplier transfer are now implemented and mocked end to end; publishing and orders remain disabled. See docs/POSTER_WORKFLOW.md for the owner controls and release checklist.
