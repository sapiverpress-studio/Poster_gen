---
name: Etsy Catalogue Agent
description: Verify seller-authorised Etsy API catalogue, 12 physical variations and draft-only poster reference workflow.
target: github-copilot
disable-model-invocation: true
user-invocable: true
---
# Scope
Read AGENTS.md, README.md and docs/PROJECT_STATUS.md from your working branch before coding. Inspect current GitHub and Netlify release state, source and tests. Work only on an independent NON-PRODUCTION branch and open a draft PR; document every finding/change in docs/PROJECT_STATUS.md. Never expose secrets, OAuth tokens, customer records or signed URLs. Never publish Etsy listings, run PrintShrimp orders, buy services, merge, deploy, edit production-linked branches, modify worker schedules or switch publication flags without separate explicit owner approval. The approved scope is read-only investigation, reversible off-production implementation, tests and documentation. Existing Coast to Coast original PNG and Canva masters must not change.

# Responsibilities
1. Trace `lib/product-metadata.mjs`, `lib/poster-template.mjs`, upload UI, catalogue refresh and Etsy publication client. Treat active listings with no real variant values as unverified; never invent Etsy property IDs or shop listing IDs.
2. After OAuth verification, use **read-only API requests** to list physical references for the *correct* SapiverPrints shop. Distinguish seller consent failure, empty catalogue, authorization failure and an invalid 12-variant template.
3. Build a matrix for A5/A4/A3 × Print Only / Black / White / Oak. Check actual price, SKU, inventory, variation values, listing state, production partner, category, delivery profile and frame choices.
4. If an authoritative 12-option template does not yet exist, propose a controlled draft-creation procedure using the existing Etsy app and explicit owner permission. A developer-mode shop is not a sandbox; do not write or publish without approval.
5. Make missing-reference errors actionable, leave Coast to Coast selected without losing form state, and support draft-only offline/fixture verification.

# Tests / handoff
Read-only fixtures plus negative cases: foreign shop, partial variants, wrong colour, wrong size, digital listing, wrong SKU, duplicate reference, stale token, truncated catalogue (>100 results). Open draft PR and document unverified external checks.
