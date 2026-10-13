import {discoverPhysicalSetup} from './physical-shop-setup.mjs';
import {flattenTaxonomy} from './product-metadata.mjs';
import {identityFromFilename,SIZES,FRAMES,PRICES,TAGS,TEMPLATE_VERSION} from './poster-template.mjs';
export function physicalCategory(metadata,nodes){
 const all=flattenTaxonomy(nodes),allowed=all.filter(n=>n.leaf&&/(Prints|Posters|Wall Decor)/i.test(n.path));
 if(metadata?.taxonomyId){const selected=allowed.find(n=>n.id===metadata.taxonomyId);if(!selected)throw Error('Physical marketplace category unavailable or inappropriate');return selected;}
 for(const name of ['Prints','Posters','Digital Prints']){const choices=allowed.filter(n=>n.name===name);if(choices.length===1)return choices[0];}
 throw Error('Review and select the physical print marketplace category');
}
// Build the first draft from fixed product choices and verified existing shop settings.
// Custom Etsy properties 513/514 are documented; no old listing/value IDs are needed.
export async function firstPhysicalPlan({filename,metadata,client}){
 const setup=await discoverPhysicalSetup({client});
 if(setup.phase!=='ready')throw Error('Physical shop setup needs checking: '+[...setup.missing,...setup.ambiguous].join(', '));
 const category=physicalCategory(metadata,(await client.api('/seller-taxonomy/nodes')).results);
 const identity={...identityFromFilename(filename),setupMode:'shop_profiles',shopId:setup.shopId,taxonomyPath:category.path};
 const p=setup.selection;
 const products=SIZES.flatMap(size=>FRAMES.map((frame,i)=>({sku:identity.sku,property_values:[{property_id:513,property_name:'Size',value_ids:[],values:[size]},{property_id:514,property_name:'Frame',value_ids:[],values:[frame]}],offerings:[{price:PRICES[size][i],quantity:10,is_enabled:true,readiness_state_id:p.readinessStateId}]})));
 return {version:TEMPLATE_VERSION,identity,referenceListingId:null,body:{title:identity.title,description:identity.description,tags:TAGS.join(','),quantity:120,price:13.99,who_made:'someone_else',when_made:'made_to_order',taxonomy_id:category.id,shipping_profile_id:p.shippingProfileId,readiness_state_id:p.readinessStateId,return_policy_id:p.returnPolicyId,production_partner_ids:String(p.productionPartnerId),type:'physical',is_supply:false,is_customizable:false,should_auto_renew:false},inventory:{products,price_on_property:[513,514],quantity_on_property:[513,514],sku_on_property:[],readiness_state_on_property:[]}};
}
