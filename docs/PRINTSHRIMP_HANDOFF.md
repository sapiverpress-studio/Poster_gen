# PrintShrimp one-master handoff

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

Remaining: access actual merchant account/API schema for artwork upload, confirm if API accepts image URL or multipart asset, and implement a private server-to-supplier transfer of the existing one master. Avoid temporary public URLs and do not guess API endpoints. Confirm existing Etsy postage profile, pricing, paper finish, and whether the listing already exists before proposing new variations. Do not publish or order without explicit owner approval. Physical proof and visual pixel review pending.

Avoid new Netlify production deployments until actual integration has been developed and tested as a single release.
