# Etsy lead photographs — framed-first catalogue alignment

**Completed:** 21 October 2026, via authenticated GitHub Actions Etsy API calls; no Netlify build.

The final read-only merchant audit returned:

```json
{"standard":30,"legacy":5,"bundles":2,"total":37,"missing":[],"preservedUnframedGallery":true,"noInventoryChange":true}
```

## What changed

- **30 standard physical individual posters:** promoted their original oak-framed furnished-scene photo from image 4 to image 1 (no new upload). Existing unframed mockup remains in the gallery.
- **5 educational individual posters:** promoted the pre-existing oak-framed furnished-scene photo from image 2 to image 1. No new upload.
- **Forest Friends**: Etsy listing `4600180569`, SKU `SP-TRIO-D1B581C8843C136EF3744B3D`; new framed three-poster overview uploaded as image `8717651560`, rank 1. Original overview `8717066198`, rank 5.
- **Hidden Paths**: Etsy listing `4600182933`, SKU `SP-TRIO-7AD9AD4192AB53D36FCE3CC6`; new framed overview uploaded as image `8718094786`, rank 1. Original overview `8717084020`, rank 5.

Both new bundle overview images display the original poster designs within oak-frame mockups and carry the wording **"THREE SEPARATE UNFRAMED A4 PRINTS — Frames shown for display only — frames are not included."** Etsy image alt text also discloses that frames are not included. Each bundle's original four gallery pictures remain. Both bundle listings stayed active and retain their exact PrintShrimp bundle SKUs.

## Verification

- Final GitHub Actions **run 39586502678, attempt 4**, concluded success at 2026-10-21 16:46 UTC and rechecked 37/37 listing lead images and bundle inventory SKUs.
- The final audit verified each of the 30 standard and five educational listing states and image ranks, both bundle primary images, retained original artwork gallery photo, and unchanged bundle SKU.
- Earlier API writes used individual image-rank mutation and, for the two bundles only, approved new photographic mockup uploads. No listing text/prices/inventory/fulfilment or supplier product writes in this migration.
- No Netlify deployment.
- One-off write and audit hooks retired from `scripts/github-publication.mjs` following successful final readback.

**Future uploader default:** `lib/uploaded-poster.mjs` still uploads standard poster mockups with unframed image rank 1. Change the upload-order policy with a separate tested release when next deploying; do not trigger a Netlify build solely for this migration.
