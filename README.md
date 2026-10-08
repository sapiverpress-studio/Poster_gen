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
- **Pending:** approve/save background-edge adjustment (an unsaved Canva draft), inspect final full-resolution artwork, verify print margins/colour, and obtain a PrintShrimp proof.
- **Not yet integrated:** automatic arbitrary Canva link processing, Etsy draft creation, PrintShrimp product/variation mapping or automated fulfilment.

## Code locations

- `netlify/functions/canva-oauth.mjs` — password-protected Canva OAuth flow.
- `netlify/functions/canva-print-check.mjs` — private PNG export, job-status and download routes.
- `lib/oauth.mjs` and `lib/print-check.mjs` — shared security/export and image/PPI checks.
- `test/*.test.mjs` — regression tests (run `npm test`; Node 20+).
- `netlify.toml` — publishes `public` and `netlify/functions`.

## Release, costs and secrets

The last verified **live** Netlify deployment branch is `feature/canva-oauth-callback`; this `docs/handover-and-change-policy-20261008` branch **only contains documentation updates** and is **not a production release**.

The team's October billing screen showed substantial production deployment credit usage. **Never push changes to a production-deployed branch, trigger a deployment, change automatic builds, merge or spend deployment credits without the owner's explicit release approval.** Group tested changes into one controlled release.

Never commit Canva client credentials, passwords, tokens, private PNGs, signed export links, customer data or stored cookies. Configuration is kept privately in Netlify environment variables and Blobs.

No automatic Etsy publication or PrintShrimp manufacturing order without the owner's explicit approval.

**Future chats:** open the repository at the branch containing the latest handover and read `AGENTS.md` and `docs/PROJECT_STATUS.md` before attempting edits. The repository files do not automatically appear in every ChatGPT conversation; you must explicitly inspect them.
