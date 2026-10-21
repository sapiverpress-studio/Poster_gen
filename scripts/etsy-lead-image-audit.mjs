// Read-only physical Etsy image-rank audit. No seller writes and no Netlify deploy.
// Existing 1448×1186 Sapiver scenes: rank 1 unframed, 2 black, 3 white, 4 oak.
export async function auditPrimaryImages({client}){
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))throw Error('Wrong Etsy seller');
 const listings=[];for(let offset=0;offset<1000;offset+=100){
  const r=await client.api('/shops/'+seller.shop_id+'/listings/active?'+new URLSearchParams({limit:'100',offset:String(offset)}));
  if(!Array.isArray(r.results)||r.results.length>100)throw Error('Etsy active listing pagination failed');
  listings.push(...r.results.filter(x=>x.shop_id===seller.shop_id&&(x.listing_type==='physical'||x.type==='physical')));
  if(offset+r.results.length>=r.count||r.results.length<100)break;
 }
 console.log('IMAGE_AUDIT_CATALOG '+JSON.stringify({count:listings.length}));
 for(const l of listings){
  const response=await client.api('/listings/'+l.listing_id+'/images');
  if(!Array.isArray(response?.results))throw Error('Etsy images missing '+l.listing_id);
  const images=response.results.map(x=>({id:x.listing_image_id,rank:x.rank,width:x.full_width,height:x.full_height,alt:typeof x.alt_text==='string'&&x.alt_text.length>0}));
  const sorted=[...images].sort((a,b)=>a.rank-b.rank);
  const standard=images.length===4&&images.every(x=>x.width===1448&&x.height===1186)&&[1,2,3,4].every((rank,i)=>sorted[i].rank===rank);
  const bundle=/woodland verse prints.*(set of 3|fox robin|badger red squirrel)/i.test(l.title||'');
  const kind=bundle?'unframed_bundle':standard?'standard_four_scene':'requires_manual_review';
  const choose=standard&&!bundle?sorted[3]?.id:null;
  console.log('IMAGE_AUDIT_ITEM '+JSON.stringify({id:l.listing_id,kind,title:String(l.title||'').slice(0,100),images,oakCandidateImageId:choose,shopId:seller.shop_id}));
 }
 console.log('IMAGE_AUDIT_COMPLETE '+JSON.stringify({count:listings.length,writes:0}));
}
