import {SIZES,FRAMES,PRICES,templateDraftPlan} from '../../lib/poster-template.mjs';
export const reference={shop_id:456,listing_id:789,state:'active',listing_type:'physical',price:{currency_code:'GBP'},taxonomy_id:123,shipping_profile_id:11,readiness_state_id:22,return_policy_id:33,who_made:'someone_else',when_made:'made_to_order'};
export const inventory={products:SIZES.flatMap((size,i)=>FRAMES.map((frame,j)=>({sku:'REFERENCE',property_values:[{property_id:513,property_name:'Size',value_ids:[i+1],values:[size]},{property_id:514,property_name:'Frame',value_ids:[j+10],values:[frame]}],offerings:[{price:{amount:Math.round(PRICES[size][j]*100),divisor:100,currency_code:'GBP'},quantity:10,is_enabled:true,readiness_state_id:22}]})))};
export const shipping={title:'PrintShrimp — Posters',origin_country_iso:'GB',origin_postal_code:'RM6 6AX',shipping_profile_destinations:[{destination_country_iso:'GB',shipping_carrier_id:9,mail_class:'second',min_delivery_days:2,max_delivery_days:3,primary_cost:{amount:0},secondary_cost:{amount:0}}],shipping_profile_upgrades:[]};
export const processing={shop_id:456,readiness_state:'made_to_order',min_processing_days:1,max_processing_days:2};
export const returns={shop_id:456,accepts_returns:true,accepts_exchanges:true};
export const plan=()=>templateDraftPlan({filename:'SP-EL-006-DINOSAURS-ACROSS-TIME.png',reference,inventory,shopId:456});

export const carriers={results:[{shipping_carrier_id:9,name:'Royal Mail',domestic_classes:[{mail_class_key:'second',name:'2nd Class'}]}]};
