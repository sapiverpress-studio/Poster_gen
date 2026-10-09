import {createHash} from "node:crypto";
export const FOOTER="Sapiver Press creates warm, playful educational artwork designed to make learning part of everyday childhood.\n\nOur illustrations are created for children\u2019s bedrooms, nurseries, playrooms and learning spaces, combining useful early-learning ideas with artwork that feels at home on the wall.\n\nWe focus on clear, engaging subjects that children can explore naturally \u2014 from letters, numbers, colours and shapes to animals, nature, science and the wider world.\n\nThe aim is simple: create children\u2019s artwork that has a genuine purpose without making a bedroom feel like a classroom.\n\nEach Sapiver Press design is part of a growing collection of thoughtful, characterful learning art made for curious young minds.\n\nSome illustrated elements in this design were created with the assistance of generative AI tools and were subsequently selected, arranged and prepared for print by Sapiver Press.";
export const TAGS=Object.freeze(["educational poster", "kids wall art", "nursery wall art", "learning wall art", "kids room decor", "playroom decor", "toddler learning", "preschool decor", "early learning", "nursery poster", "childrens wall art", "learning poster", "educational decor"]);
export const SIZES=Object.freeze(['A5','A4','A3']);
export const FRAMES=Object.freeze(['Black Frame','White Frame','Oak Frame']);
export const PRICES=Object.freeze({A5:Object.freeze([49.99,49.99,49.99]),A4:Object.freeze([54.99,54.99,54.99]),A3:Object.freeze([64.99,64.99,64.99])});
export const TEMPLATE_VERSION='sapiver-framed-posters-v2';
export function identityFromFilename(filename) {
 if(typeof filename!=='string'||filename.length>180||/[\\/\x00-\x1f]/.test(filename)||!filename.toLowerCase().endsWith('.png'))throw Error('Use a PNG filename with the poster name');
 const stem=filename.slice(0,-4).trim();
 if(!stem||/\([0-9]+\)$/.test(stem))throw Error('Remove automatic download numbering from the filename');
 const rawName=stem.replace(/^SP-EL-\d{3}-/i,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
 if(!rawName||!/[A-Za-z]/.test(rawName))throw Error('Filename must contain a poster subject');
 const name=rawName===rawName.toUpperCase()?rawName.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()):rawName;
 const clean=stem.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' AND ').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase();
 const sku=/^SP-EL-\d{3}-/.test(clean)?clean:'SP-'+clean;
 if(sku.length>50)throw Error('Filename is too long for the supplier SKU');
 const title=name+' Educational Poster for Kids';if(title.length>140)throw Error('Poster name is too long');
 return {filename,name,sku,title,description:name+' printed educational poster. This is a physical framed print, not downloadable artwork.\n\n'+FOOTER};
}
export function normalizeFrame(value) {
 const s=String(value).toLowerCase().replace(/[^a-z]/g,'');
 if(['printonly','unframed','noframe'].includes(s))return 'Print Only';
 for(const color of ['black','white','oak'])if([color,color+'frame',color+'framed'].includes(s))return color[0].toUpperCase()+color.slice(1)+' Frame';
 return null;
}
export function normalizeSize(value){const m=/^(A[345])(?:$|[\s(–—-])/i.exec(String(value));return m?.[1].toUpperCase()||null;}
const positive=n=>Number.isSafeInteger(n)&&n>0;
export function templateDraftPlan({filename,reference,inventory,shopId}) {
 const identity=identityFromFilename(filename);
 if(reference.shop_id!==shopId||reference.state!=='active'||reference.listing_type!=='physical'||reference.price?.currency_code!=='GBP'||reference.who_made!=='someone_else'||reference.when_made!=='made_to_order')throw Error('Reference must match the physical made-to-order template');
 for(const k of ['taxonomy_id','shipping_profile_id','readiness_state_id','return_policy_id'])if(!positive(reference[k]))throw Error('Reference template profile is missing');
 let sizeId,frameId;
 const products=SIZES.flatMap(size=>FRAMES.map((frame,i)=>{
  const matches=(inventory.products||[]).filter(p=>!p.is_deleted&&p.property_values?.length===2&&p.property_values.every(v=>v.values?.length===1)&&p.property_values.some(v=>normalizeSize(v.values[0])===size)&&p.property_values.some(v=>normalizeFrame(v.values[0])===frame));
  if(matches.length!==1)throw Error('Reference must have all nine framed size/frame combinations');
  const p=matches[0],sv=p.property_values.find(v=>normalizeSize(v.values[0])===size),fv=p.property_values.find(v=>normalizeFrame(v.values[0])===frame);
  if(!positive(sv.property_id)||!positive(fv.property_id)||sv.property_id===fv.property_id||(sizeId&&sizeId!==sv.property_id)||(frameId&&frameId!==fv.property_id))throw Error('Reference variation properties are inconsistent');
  sizeId=sv.property_id;frameId=fv.property_id;
  const offers=(p.offerings||[]).filter(o=>o.is_enabled&&!o.is_deleted);const o=offers[0];
  if(offers.length!==1||!positive(o.quantity)||o.readiness_state_id!==reference.readiness_state_id||o.price?.currency_code!=='GBP'||o.price.amount/o.price.divisor!==PRICES[size][i])throw Error('Reference prices or processing settings differ from the supplied template');
  return {sku:identity.sku,property_values:p.property_values.map(v=>({property_id:v.property_id,property_name:v.property_name,value_ids:v.value_ids||[],values:v.values,...(v.scale_id?{scale_id:v.scale_id}:{})})),offerings:[{price:PRICES[size][i],quantity:o.quantity,is_enabled:true,readiness_state_id:reference.readiness_state_id}]};
 }));
 const body={title:identity.title,description:identity.description,tags:TAGS.join(','),quantity:products.reduce((n,p)=>n+p.offerings[0].quantity,0),price:49.99,who_made:'someone_else',when_made:'made_to_order',taxonomy_id:reference.taxonomy_id,shipping_profile_id:reference.shipping_profile_id,readiness_state_id:reference.readiness_state_id,return_policy_id:reference.return_policy_id,type:'physical',is_supply:false,is_customizable:false,should_auto_renew:false};
 const plan={version:TEMPLATE_VERSION,identity,referenceListingId:reference.listing_id,body,inventory:{products,price_on_property:[sizeId,frameId],quantity_on_property:[sizeId,frameId],sku_on_property:[],readiness_state_on_property:[]}};
 return {...plan,hash:createHash('sha256').update(JSON.stringify(plan)).digest('hex')};
}
export function verifyTemplateProfiles(shipping,processing,returns,shopId) {
 const dest=shipping.shipping_profile_destinations;
 if(shipping.title!=='PrintShrimp — Posters'||shipping.is_deleted||shipping.origin_country_iso!=='GB'||shipping.origin_postal_code?.replace(/\s/g,'').toUpperCase()!=='RM66AX'||!Array.isArray(dest)||dest.length!==1||dest[0].destination_country_iso!=='GB'||dest[0].primary_cost?.amount!==0||dest[0].secondary_cost?.amount!==0||(shipping.shipping_profile_upgrades||[]).length)throw Error('Delivery profile must be the free UK-only template');
 if(processing.shop_id!==shopId||processing.readiness_state!=='made_to_order'||processing.min_processing_days!==1||processing.max_processing_days!==2)throw Error('Processing profile must be made to order in one to two days');
 if(returns.shop_id!==shopId||returns.accepts_returns!==true||returns.accepts_exchanges!==true)throw Error('Returns and exchanges must match the template');
}
export function verifyTemplateInventory(inventory,plan) {
 const products=(inventory.products||[]).filter(p=>!p.is_deleted);
 if(products.length!==9)throw Error('Expected nine supplier size/frame combinations');
 for(const expected of plan.inventory.products){const match=products.filter(p=>p.sku===plan.identity.sku&&p.property_values?.length===2&&expected.property_values.every(v=>p.property_values.some(w=>w.property_id===v.property_id&&JSON.stringify(w.values)===JSON.stringify(v.values))));
 if(match.length!==1)throw Error('Published inventory SKU or variations mismatch');
 const offers=match[0].offerings.filter(o=>o.is_enabled&&!o.is_deleted);if(offers.length!==1||offers[0].price?.currency_code!=='GBP'||offers[0].price.amount/offers[0].price.divisor!==expected.offerings[0].price||offers[0].readiness_state_id!==expected.offerings[0].readiness_state_id)throw Error('Inventory price or processing read-back mismatch');}
}
export function verifyTemplateCarrier(shipping,carriers) {
 const dest=shipping.shipping_profile_destinations?.[0],carrier=carriers.results?.find(c=>c.shipping_carrier_id===dest?.shipping_carrier_id),mail=carrier?.domestic_classes?.find(c=>c.mail_class_key===dest.mail_class);
 if(carrier?.name!=='Royal Mail'||!/^(?:Royal Mail )?(?:2nd|Second) Class$/i.test(mail?.name||'')||dest.min_delivery_days!==2||dest.max_delivery_days!==3)throw Error('Delivery service must be Royal Mail second class, two to three business days');
}
export function verifyTemplateListing(listing,plan,{shopId,state}) {
 if(listing.shop_id!==shopId||listing.state!==state||listing.listing_type!=='physical'||listing.is_personalizable!==false)throw Error('Listing state or personalisation differs from approval');
 for(const k of ['title','description','taxonomy_id','shipping_profile_id','readiness_state_id','return_policy_id','who_made','when_made'])if(listing[k]!==plan.body[k])throw Error('Listing details changed from the approved template');
 if(!Array.isArray(listing.tags)||listing.tags.slice().sort().join('|')!==plan.body.tags.split(',').sort().join('|'))throw Error('Listing tags differ from approval');
}
