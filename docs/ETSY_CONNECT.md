# Etsy seller connection release checklist

Implemented on isolated handover branch, not deployed.

1. Ensure the already existing Etsy app key pair is available to Netlify Functions as `ETSY_PRINTS_KEYSTRING` and `ETSY_PRINTS_SHARED_SECRET`. GitHub Actions keeps its existing copies; no credentials belong in source or chat. Do not create replacement Etsy keys.
2. In the existing Etsy developer app register the exact redirect `CANVA_SITE_ORIGIN` + `/etsy/callback`, without a trailing slash. Its current registration has not been inspected.
3. Deploy the reviewed bundle once after owner release approval. Existing `CANVA_SITE_ORIGIN`, `CANVA_SETUP_PASSWORD`, `CANVA_CLIENT_SECRET` are reused unchanged.
4. Open `CANVA_SITE_ORIGIN` + `/etsy/start` in the owner's normal browser, enter the existing setup password, sign into the SapiverPrints owner account and authorise shop/listing scopes. This step creates NO listing and NO order.
5. Success is the page "Etsy connected" after actual API shop verification. Wrong seller, declined scopes, expired/tampered/replayed flow fail closed. Tokens stay encrypted in private `sapiver-etsy-private` storage.
6. Draft preparation is a subsequent action requiring actual prices, taxonomy, shipping and return profiles, production partner and images. It must create only one physical unpublished product with A5/A4/A3 and one common SKU.

Connection code does not implement token refresh or draft creation yet. These remain subsequent work; do not describe this route alone as a finished seller integration. Do not publish or order.
