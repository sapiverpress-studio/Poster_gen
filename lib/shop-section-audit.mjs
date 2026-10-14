export async function auditShopSections({client}){
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints')throw Error('Wrong seller');
 const shop=await client.api('/shops/'+seller.shop_id),sections=await client.api('/shops/'+seller.shop_id+'/sections');
 const listings=[];for(const state of ['active','draft','inactive']){for(let offset=0;offset<1000;offset+=100){const page=await client.api('/shops/'+seller.shop_id+'/listings?state='+state+'&limit=100&offset='+offset);if(!Array.isArray(page.results))throw Error('Shop listings unavailable');listings.push(...page.results.map(l=>({id:l.listing_id,title:l.title,type:l.listing_type,state:l.state,sectionId:l.shop_section_id})));if(page.results.length<100)break;if(offset===900)throw Error('Shop audit exceeds bound');}}
 return {phase:'verified',shopId:seller.shop_id,shopTitle:shop.title,sections:sections.results.map(s=>({id:s.shop_section_id,title:s.title,rank:s.rank,count:s.active_listing_count})),listings};
}
