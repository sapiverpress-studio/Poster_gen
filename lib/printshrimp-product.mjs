/**
 * ONE PrintShrimp asset and ONE SKU for Etsy A5, A4, A3.
 * This file performs ZERO external mutations or requests.
 */
import { APPROVED_MASTER, PNG_KEY, PRIVATE_APPROVED_STORE, MAX_FILE_BYTES } from "./approved-export.mjs";
export const PRINT_PRODUCT = Object.freeze({
  id:"dinosaurs-across-time",shop:"SapiverPrints",title:"Dinosaurs Across Time",
  sku:"SP-DINOSAURS-ACROSS-TIME",uploadFilename:"SP-DINOSAURS-ACROSS-TIME.png",
  designId:APPROVED_MASTER.designId,approvedUpdatedAt:APPROVED_MASTER.approvedUpdatedAt,
  blobStore:PRIVATE_APPROVED_STORE,blobKey:PNG_KEY,
  printSizes:Object.freeze(["A5","A4","A3"]),
  // Must be obtained from the real supplier / merchant account, not invented.
  supplierArtworkId:null,etsyListingId:null,pricesGbp:null,paperFinish:null,postageProfile:null,
});
function requireValid(ok,message){if(!ok)throw Error(message)}
export function preparePrintShrimpHandoff(report,product=PRINT_PRODUCT) {
  requireValid(product.printSizes.join("|")==="A5|A4|A3","Unexpected print sizes");
  requireValid(product.uploadFilename===product.sku+".png","SKU/file mismatch");
  requireValid(report?.phase==="ready_for_review","Master has not been exported and measured");
  requireValid(report.design_id===product.designId && report.approved_updated_at===product.approvedUpdatedAt,
    "Master approval is out of date");
  requireValid(report.file_key===product.blobKey,"Unexpected artwork source; never create a second master");
  requireValid(report.image?.width===3508 && report.image?.height===4961,"Wrong master dimensions");
  requireValid(Number.isInteger(report.image?.bytes) && report.image.bytes>0 && report.image.bytes<=MAX_FILE_BYTES,
    "Master is too large or missing");
  requireValid(/^[0-9a-f]{64}$/i.test(report.image?.sha256??""),"Missing master checksum");
  requireValid(report.printshrimp?.meets_measured_upload_checks===true,"Measured upload checks failed");
  for(const size of product.printSizes)
    requireValid(report.readiness?.print_sizes?.[size]?.passes_300ppi===true,
      "Poor print resolution at "+size);
  return {
    product:product.title,
    one_master:{store:product.blobStore,key:product.blobKey,
      sha256:report.image.sha256,bytes:report.image.bytes,width:3508,height:4961,
      filename:product.uploadFilename,uploaded:false},
    printshrimp:{sharedSku:product.sku,artworkId:product.supplierArtworkId,
      uploadStatus:"NOT_UPLOADED",orderCreationEnabled:false},
    etsy:{shop:product.shop,listingId:product.etsyListingId,listingStatus:"NOT_CREATED",
      publishEnabled:false,variations:product.printSizes.map(size=>({
        name:"Size",value:size,sku:product.sku,priceGbp:null
      }))},
    approvals:{printQuality:"PENDING",physicalProof:"PENDING",sale:false},
  };
}
