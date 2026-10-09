# PrintShrimp one-master handoff

## Definitive owner-selected order: Etsy draft FIRST

**One Etsy product → one shared SKU → one master uploaded to PrintShrimp → match three size variations → owner-approved publication.**

1. **Prepare the Etsy listing FIRST, as an unpublished draft** in the user's existing SapiverPrints shop. Size options: A5, A4, A3. All share the same product SKU (proposed `SP-DINOSAURS-ACROSS-TIME`; confirm it does not conflict with existing SKUs). Verify pricing, images, paper options and the existing PrintShrimp delivery profile; do not guess.
2. **Confirm PrintShrimp/Etsy shop connection.** Use the actual merchant portal and authenticated provider upload specifications.
3. **Upload exactly ONE existing A3 master** from private Netlify Blobs, filename matching the Etsy SKU. Do not re-export from Canva or create size-specific masters.
4. **Verify PrintShrimp SKU matching and that Etsy's ordered size controls A5/A4/A3.** Confirm supplier readiness, visual QA and any physical sample only with explicit owner approval.
5. **Publish to Etsy only with separate approval**, after supplier fulfilment is set up. Never create or pay for PrintShrimp orders without permission.

This Etsy-first ordering is the user's chosen workflow, not a claim that Etsy must be publicly published before PrintShrimp can upload art. PrintShrimp's lazy-SKU-mapping documentation allows artwork to be associated when orders arrive, and its portal may offer listing creation directly; neither alternative is the workflow chosen here.

STATUS: specification and validation staged ONLY. Real supplier upload NOT done; Etsy listing NOT created. Read AGENTS.md and PROJECT_STATUS.md before work.

Product: Dinosaurs Across Time for SapiverPrints.
One private, already approved A3 PNG: 3508 x 4961 pixels (37.4 MiB per owner's live report), Canva ID DAHXb1PdJlM, revision 1791485393. Blob key is derived from lib/approved-export.mjs.
ONE suggested shared SKU: SP-DINOSAURS-ACROSS-TIME
ONE uploaded artwork filename: SP-DINOSAURS-ACROSS-TIME.png
Etsy physical paper variations: A5 / A4 / A3. ALL use same SKU. No separate files or SKU codes for sizes.

Official PrintShrimp guidance confirms single shared SKU per product; size is inferred from Etsy order variation:
https://printshrimp.com/pages/bulk-edit-skus
https://printshrimp.com/blogs/news/printshrimp-etsy-integration
https://printshrimp.com/pages/etsy-integration

PrintShrimp says full API documentation is available to signed-in accounts:
https://printshrimp.com/pages/faq

The handoff module lib/printshrimp-product.mjs takes the existing private export report, checks approved version, SHA256, Blob key, dimensions, upload-size limit and PPI for all three sizes. It emits a side-effect-free product transfer specification. It does NOT contact Etsy/PrintShrimp. Nothing is marked uploaded or sale-approved without evidence.

Remaining: prepare an ETSY DRAFT FIRST using authenticated seller-write access, verify current shop pricing/profile/SKU, then access actual PrintShrimp merchant account/API schema for one master upload and implement private server-to-supplier transfer of the existing file. Avoid temporary public URLs and do not guess API endpoints. Confirm existing Etsy postage profile, pricing, paper finish, and whether the listing already exists before proposing new variations. Do not publish or order without explicit owner approval. Physical proof and visual pixel review pending.

Avoid new Netlify production deployments until actual integration has been developed and tested as a single release.
