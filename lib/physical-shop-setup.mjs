import {verifyTemplateProfiles,verifyTemplateCarrier} from './poster-template.mjs';
export const PHYSICAL_SETUP_VERSION=3;
const positive=n=>Number.isSafeInteger(n)&&n>0;
const rows=value=>{if(!Array.isArray(value?.results)||value.results.length>100)throw Error('Physical setup response invalid');return value.results;};
// Read-only discovery. Persist only business settings, never provider credentials or bodies.
export async function discoverPhysicalSetup({client,clock=()=>Date.now()}){
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints'||!positive(seller.shop_id))throw Error('Wrong physical shop');
 const base='/shops/'+seller.shop_id;
 const shippingRows=rows(await client.api(base+'/shipping-profiles?limit=100'));
 const processingRows=rows(await client.api(base+'/readiness-state-definitions?limit=100'));
 const returnRows=rows(await client.api(base+'/policies/return?limit=100'));
 const partnerRows=rows(await client.api(base+'/production-partners'));
 const carriers=await client.api('/shipping-carriers?origin_country_iso=GB');
 const shipping=[];
 for(const row of shippingRows){
  if(!positive(row.shipping_profile_id)||row.title!=='PrintShrimp — Posters')continue;
  const detail=await client.api(base+'/shipping-profiles/'+row.shipping_profile_id);
  if(!Array.isArray(detail.shipping_profile_destinations))detail.shipping_profile_destinations=rows(await client.api(base+'/shipping-profiles/'+row.shipping_profile_id+'/destinations'));
  shipping.push(detail);
 }
 const processing=processingRows.filter(p=>p.shop_id===seller.shop_id&&positive(p.readiness_state_id)&&p.readiness_state==='made_to_order'&&p.min_processing_days===1&&p.max_processing_days===2);
 const returns=returnRows.filter(p=>p.shop_id===seller.shop_id&&positive(p.return_policy_id)&&p.accepts_returns===true&&p.accepts_exchanges===true);
 const partners=partnerRows.filter(p=>positive(p.production_partner_id)&&/^print\s*shrimp$/i.test(p.partner_name||'')&&/Romford/i.test(p.location||''));
 const validShipping=shipping.filter(p=>{try{if(!processing.length||!returns.length)return false;verifyTemplateProfiles(p,processing[0],returns[0],seller.shop_id);verifyTemplateCarrier(p,carriers);return true;}catch{return false;}});
 const deliveryChecks=shipping.map(p=>({namedTemplate:p.title==='PrintShrimp — Posters',originMatches:p.origin_country_iso==='GB'&&p.origin_postal_code?.replace(/\s/g,'').toUpperCase()==='RM66AX',ukOnly:Array.isArray(p.shipping_profile_destinations)&&p.shipping_profile_destinations.length===1&&p.shipping_profile_destinations[0].destination_country_iso==='GB',free:Array.isArray(p.shipping_profile_destinations)&&p.shipping_profile_destinations.every(d=>d.primary_cost?.amount===0&&d.secondary_cost?.amount===0),minDeliveryDays:p.shipping_profile_destinations?.[0]?.min_delivery_days??null,maxDeliveryDays:p.shipping_profile_destinations?.[0]?.max_delivery_days??null,carrierIsRoyalMail:carriers.results?.find(c=>c.shipping_carrier_id===p.shipping_profile_destinations?.[0]?.shipping_carrier_id)?.name==='Royal Mail',classMentionsSecond:/(2nd|Second)/i.test(carriers.results?.find(c=>c.shipping_carrier_id===p.shipping_profile_destinations?.[0]?.shipping_carrier_id)?.domestic_classes?.find(c=>c.mail_class_key===p.shipping_profile_destinations?.[0]?.mail_class)?.name||''),secondClass:(()=>{try{verifyTemplateCarrier(p,carriers);return true;}catch{return false;}})()}));
 const counts={shipping:validShipping.length,processing:processing.length,returns:returns.length,partner:partners.length};
 const missing=Object.entries(counts).filter(([,count])=>count===0).map(([kind])=>kind);
 const ambiguous=Object.entries(counts).filter(([,count])=>count>1).map(([kind])=>kind);
 const ready=!missing.length&&!ambiguous.length;
 return {version:PHYSICAL_SETUP_VERSION,deliveryChecks,phase:ready?'ready':missing.length?'setup_required':'ambiguous',shopId:seller.shop_id,checkedAt:clock(),counts,missing,ambiguous,...(ready?{selection:{shippingProfileId:validShipping[0].shipping_profile_id,readinessStateId:processing[0].readiness_state_id,returnPolicyId:returns[0].return_policy_id,productionPartnerId:partners[0].production_partner_id}}:{})};
}
export function physicalSetupSummary(result){return 'Physical shop setup: '+(['ready','setup_required','ambiguous'].includes(result?.phase)?result.phase:'unavailable')+'; '+['shipping','processing','returns','partner'].map(k=>k+'='+Number(result?.counts?.[k]||0)).join('; ')+'; delivery checks='+JSON.stringify(result?.deliveryChecks||[]);}
