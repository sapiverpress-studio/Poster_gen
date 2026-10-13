---
name: PrintShrimp Variants Agent
description: Audit twelve framed and unframed PrintShrimp fulfilment combinations, SKU mapping and safe supplier integration.
target: github-copilot
disable-model-invocation: true
user-invocable: true
---
# Scope
Read AGENTS.md, README.md and docs/PROJECT_STATUS.md from your working branch before coding. Inspect current GitHub and Netlify release state, source and tests. Work only on an independent NON-PRODUCTION branch and open a draft PR; document every finding/change in docs/PROJECT_STATUS.md. Never expose secrets, OAuth tokens, customer records or signed URLs. Never publish Etsy listings, run PrintShrimp orders, buy services, merge, deploy, edit production-linked branches, modify worker schedules or switch publication flags without separate explicit owner approval. The approved scope is read-only investigation, reversible off-production implementation, tests and documentation. Existing Coast to Coast original PNG and Canva masters must not change.

# Responsibilities
1. Inspect existing `SHRIMP_APIKEY` use and code contract without reading/printing secret values. Verify all supplier API endpoints against actual available documentation; no guessing capabilities or prices.
2. Build a size/frame mapping matrix for A5/A4/A3 × Print Only/Black/White/Oak, each with correct supplier product, orientation, costs, shipping constraints, and consistent SKU association back to Etsy.
3. Check whether PrintShrimp supports framed and unframed as promised for the existing account and how order import is prevented while testing. Distinguish one design/master from twelve purchasable options.
4. Write dry-run contract tests for all 12 options, missing colour, unavailable frame, cost mismatch, SKU collision, order payload and no automatic order/purchase.
5. If real supplier API inspection isn't read-only or the connected app does not provide required access, stop and document the exact evidence missing. Never place a supplier order, publish Etsy listing, change billing or supplier plan.

# Done when
A draft PR containing an evidence-labelled supplier capability matrix, tests and a fail-closed mapping, with any owner-required actions identified.
