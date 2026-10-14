import {knownWorkerErrors} from './worker-known-errors.mjs';
// Public workflow logs contain fixed classifications only, never exception text.
const operations=new Set(['inventory','images','listing','catalogue']);
const reasons=new Map([
 ['PNG must match A-series and meet at least 270 PPI at A3','artwork_dimensions'],
 ['Invalid PNG signature','invalid_png'],['Missing upload chunk','missing_upload_chunk'],
 ['Upload chunk size mismatch','incomplete_upload_chunk'],['Upload length mismatch','upload_length_mismatch'],
 ['Etsy seller connection required','seller_consent_required'],['Invalid Etsy seller connection','seller_consent_invalid'],
 ['Etsy refresh needs investigation or reconnection','seller_refresh_failed'],
 ['Bridge unavailable','private_storage_unavailable'],['Identity unavailable','github_identity_unavailable'],
 ['Saved provider configuration incomplete','provider_configuration_missing'],
 ['Not ready','product_not_ready'],['No owner approval','approval_missing'],
 ['Supplier key missing','supplier_configuration_missing'],
 ['Supplier SKU collision or lookup unavailable','supplier_lookup_or_sku_conflict'],
 ['Supplier create unavailable','supplier_create_failed'],['Supplier read-back unavailable','supplier_readback_failed'],
 ['Supplier did not persist three print sizes','supplier_sizes_not_verified'],
 ['Supplier upload already reserved','supplier_transfer_locked'],
 ['Draft response mismatch','etsy_draft_verification_failed'],['Draft images or seller mismatch','etsy_images_verification_failed'],
 ['Mockup missing','saved_mockup_missing'],['Product review superseded','review_superseded'],['Etsy request failed','etsy_request_failed']
]);
export function workerFailure(error){
 const reason=reasons.get(error?.message)||'unclassified_failure';
 const result={reason};
 if(knownWorkerErrors.has(error?.message)){result.message=error.message;if(reason==='unclassified_failure')result.reason='application_validation_failed';}
 if(['TypeError','RangeError','SyntaxError','AbortError'].includes(error?.name)&&reason==='unclassified_failure')result.reason=error.name;
 if(reason==='etsy_request_failed'){
  if(operations.has(error.etsyOperation))result.operation=error.etsyOperation;
  if(['sku_length_rejected','variation_configuration_rejected','processing_profile_rejected','price_rejected','quantity_rejected','unclassified_rejection'].includes(error.validationReason))result.validationReason=error.validationReason;
  if(Array.isArray(error.mentionedFields))result.mentionedFields=error.mentionedFields.filter(f=>['sku','price','quantity','property','readiness','image','taxonomy'].includes(f));
  if(Number.isInteger(error.etsyStatus)&&error.etsyStatus>=400&&error.etsyStatus<=599)result.httpStatus=error.etsyStatus;
 }
 if(error?.name==='TimeoutError')result.reason='request_timeout';
 return result;
}
export function reportWorkerResult(result,{log=console.log,error=console.error}={}){
 log('Worker tasks: completed='+result.completed+'; failed='+result.failures.length+'; skipped='+result.skipped);
 for(const failure of result.failures)error('::error::Product task failed: '+JSON.stringify(failure));
 if(!result.completed&&!result.failures.length)log('No queued task completed. Previously failed publications remain locked; this run does not retry them.');
 const catalogueFailed=!['available','empty'].includes(result.cataloguePhase);
 if(catalogueFailed)error('::error::Catalogue check failed: '+(['seller_consent_required','seller_consent_invalid','seller_refresh_error','etsy_api_unavailable'].includes(result.cataloguePhase)?result.cataloguePhase:'not_checked'));
 return result.failures.length||catalogueFailed?1:0;
}

const stages=new Set(['queued','starting','reading_upload','validating_artwork','checking_etsy_settings','creating_previews','saving_review','validating_upload','checking_etsy_category','checking_etsy_connection','saving_listing_photos','etsy_draft','supplier_verified','publishing_etsy','updating_metadata','creating_digital_draft','digital_draft','attaching_downloads']);
export function safeWorkerStage(stage){return stages.has(stage)?stage:'unknown_stage';}
