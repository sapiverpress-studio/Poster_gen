# Etsy dual-supplier routing audit — REVIEW ONLY

**Status: staged on an isolated non-production branch. NOT EXECUTED AGAINST LIVE ACCOUNTS.**

## Provider findings — 16 November 2026

- **Prodigi** imports all Etsy listings. A new listing may default to **Fulfilled by Prodigi**; set the shop's *new product default* to **Ignored for fulfilment**. Activate only individually approved card listings after each SKU, artwork and variant are configured. Existing posters must remain grey/off. Prodigi warns that editing Etsy variants can create a new Prodigi listing identity, requiring a fresh routing check. Sources: https://www.prodigi.com/etsy-print-on-demand/support/configure-your-products/ ; https://www.prodigi.com/faq/etsy/
- **PrintShrimp** auto-imports eligible Etsy orders when configured, then matches SKUs to saved products. Every Etsy variation for one print must share the same product SKU and each offered print size must have its own artwork file. Only **Ready** orders are eligible for auto-pay; an unmatched SKU becomes **Attention** or **Rejected**. No published API method was found to exclude an individual Etsy SKU from order import or read shop auto-import/auto-pay settings. Sources: https://printshrimp.com/blogs/ai-agents/sell-on-etsy ; https://printshrimp.com/blogs/ai-agents/skus ; https://printshrimp.com/blogs/ai-agents/api-reference
- **Etsy** read APIs permit owner-authorised listing and inventory SKU inspection. Production-partner disclosure is separate from fulfilment routing. Sources: https://developer.etsy.com/documentation/reference ; https://help.etsy.com/hc/en-gb/articles/360000336547-Working-with-Production-Partners-on-Etsy

## Required supplier separation

| Etsy listing | Intended supplier | Guard |
| --- | --- | --- |
| Posters | PrintShrimp | Verified shared SKU + offered size artwork. Prodigi toggle OFF. |
| Individual Streak 7×5 cards | Prodigi | Exact card listing ID explicitly enabled and mapped in Prodigi; its SKU must **not** exist in PrintShrimp. |
| Digital ZIPs | Etsy | No print fulfilment. |

Use an owner-reviewed **route registry keyed by Etsy listing ID**, not just title, product image or a SKU prefix. A future naming convention for new products may use SP-CARD-... for cards and SP-POST-... for posters, but **never bulk-rewrite existing live SKU identities**. Publish cards and posters created in one batch as separate listings and keep activation as separate approved steps.

**Critical caveat:** A Prodigi card order may still appear in PrintShrimp's unmatched-order attention queue if its whole-shop auto-import is on. Keeping card SKUs out of PrintShrimp prevents its documented SKU-based path from making these card orders Ready, but does not prove complete isolation. Do not create card SKUs in PrintShrimp; do not treat this as a guarantee against errors. Ask PrintShrimp whether per-listing import exclusion is available and verify the actual auto-pay/import state in its dashboard before enabling unattended dual-supplier fulfilment.

For future fully centralised routing, a separate Etsy-order router would need to be the **only** order dispatcher, replacing the competing supplier auto-import functions and implementing one-time order claims, per-line SKU decisions, idempotency, duplicate protection, cancellations, refunds, tracked shipment completion and no-orders-on-ambiguous-status safeguards. This is a separate, higher-risk project, NOT authorised here.


## Mixed Etsy checkout risk — important

When a customer buys a PrintShrimp poster AND a Prodigi card in one Etsy order, PrintShrimp's documented order-check treats the **whole imported order** as Ready only if **every item** is matched/priced. An unfamiliar card SKU therefore makes the order Attention or Rejected; **the poster may also wait rather than auto-pay**. If Prodigi is separately enabled for the card, only part of the checkout may dispatch on time. Confirm how each provider handles partial shipments and Etsy order completion/tracking before unattended dual-supplier use. Direct source: https://printshrimp.com/blogs/ai-agents/sell-on-etsy (How an Etsy order flows, Ready rule). This is a credible operational risk derived from documented logic, not a completed live mixed-basket test.

## The staged code

- lib/supplier-routing-audit.mjs: collectSupplierSnapshot({client,apiKey,request,expectedRoutes}) reads authenticated Etsy shop listing/inventory pages and PrintShrimp GET /api-get-product.
- compareSupplierSnapshot(...) compares shared SKUs and offered A3/A4/A5 sizes against saved PrintShrimp product sizes and artwork URL presence, flags missing files/SKUs, duplicate SKUs and card/PrintShrimp SKU collisions.
- safeAuditSummary(...) emits aggregate counts without listing IDs, SKU strings, order/customer details or provider response bodies.
- Explicit expectedRoutes by Etsy listing ID are required to claim an intended supplier; never infer Prodigi configuration from an absent PrintShrimp SKU.
- The module adds **no workflow, schedule, API route, publish operation, order creation, payment, partner change or merchant mutation**.

test/supplier-routing-audit.test.mjs uses fabricated fixtures, wrong-shop checks and GET-only assertions. Fixture success is not live supplier evidence.

## Before a live audit or launch

1. Confirm Prodigi *new product default = Ignored for fulfilment* in its connected Etsy listing screen. Grey existing posters are confirmed only for the examples actually visible in screenshots.
2. Confirm PrintShrimp's Etsy connection (shown Connected) and separately inspect Settings → Order Automation and unresolved Create Orders attention queue.
3. Authorise a one-shot **read-only trusted worker** separately. Use the existing encrypted Etsy seller session and GitHub SHRIMP_APIKEY without exposing either; run the staged function, report aggregates privately and review any ambiguous listing IDs before changing anything.
4. Before a first card sale, create one draft Etsy card listing, confirm Prodigi product mapping and preview, run a print sample, choose whether personalised direct-delivery is genuinely ready and test a controlled order.
5. Any future new/edited listing must be re-audited before Prodigi activation.

**Not verified by APIs:** Prodigi toggle/default state, PrintShrimp order-automation switches or wallet, unpaid PrintShrimp orders, card sample print quality, live Etsy shop SKU mappings, and end-to-end routing.

**Release gate:** No run against live accounts, no merge/deploy and no workflow changes until separate explicit approval. No Work credits required.
