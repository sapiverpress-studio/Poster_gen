// Classify bounded provider text, never return or persist the provider body itself.
export function classifyEtsyRejection(text){
 const s=String(text).slice(0,16000).toLowerCase();
 const fields=['sku','price','quantity','property','readiness','image','taxonomy'].filter(k=>s.includes(k));
 let validationReason='unclassified_rejection';
 if(s.includes('sku')&&/(length|characters|too long|32)/.test(s))validationReason='sku_length_rejected';
 else if(/property|variation/.test(s))validationReason='variation_configuration_rejected';
 else if(/readiness|processing/.test(s))validationReason='processing_profile_rejected';
 else if(/price/.test(s))validationReason='price_rejected';
 else if(/quantity/.test(s))validationReason='quantity_rejected';
 return {validationReason,mentionedFields:fields};
}
