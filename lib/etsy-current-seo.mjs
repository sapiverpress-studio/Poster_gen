// Current seller-catalogue SEO. Read-only proposals until an owner-approved, one-listing worker task.
// Never changes Etsy inventory, customer files, prices, images or fulfilment.
import {createHash} from 'node:crypto';

export const CURRENT_SEO='seo-current/state';
export const approvalKey=id=>'seo-current/approval/'+id;
const positive=n=>Number.isSafeInteger(n)&&n>0;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const knownType=t=>['physical','download'].includes(t);
const clean=s=>String(s||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
const forbid=/\b(?:bestseller|best seller|trending|viral|guaranteed sales|most popular)\b/i;
const metadataSnapshot=l=>({
 shop_id:l.shop_id,listing_id:l.listing_id,state:l.state,listing_type:l.listing_type,
 title:l.title,description:l.description,tags:l.tags,taxonomy_id:l.taxonomy_id,
 shop_section_id:l.shop_section_id??null,price:l.price??null,
 shipping_profile_id:l.shipping_profile_id??null,return_policy_id:l.return_policy_id??null,
 readiness_state_id:l.readiness_state_id??null,who_made:l.who_made??null,
 when_made:l.when_made??null,is_supply:l.is_supply??null,has_variations:l.has_variations??null
});
export const fingerprint=l=>hash(metadataSnapshot(l));
const protectedFields=l=>{const s=metadataSnapshot(l);delete s.title;delete s.description;delete s.tags;return hash(s)};
const validImageUrl=value=>{
 if(typeof value!=='string'||value.length>1000)return false;
 try{const u=new URL(value);
  return u.protocol==='https:'&&u.hostname==='i.etsystatic.com'&&!u.username&&!u.password&&!u.port&&
   /^\/[A-Za-z0-9_./%-]+$/.test(u.pathname)&&!u.search;
 }catch{return false;}
};
export function validateCurrentSeoProposal(raw,type,{trio=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('AI returned incomplete listing fields');
 const title=clean(raw.title),tags=Array.isArray(raw.tags)?raw.tags.map(clean):[],intro=clean(raw.intro);
 if(!title||title.length>140||/[<>\x00-\x1f]/.test(title)||forbid.test(title))throw Error('Title is invalid');
 if(type==='physical'&&!/\b(?:prints?|posters?|wall art)\b/i.test(title))throw Error('Title must describe a physical print');
 if(type==='download'&&!/\b(?:digital|download|seamless|pattern|clip art|printable|svg|png)\b/i.test(title))throw Error('Digital title must identify the downloadable product');
 if(trio&&!/\b(?:set|trio|collection|bundle)\b/i.test(title))throw Error('Three-print title must identify a set');
 if(tags.length!==13||new Set(tags.map(x=>x.toLowerCase())).size!==13||
    tags.some(x=>!x||x.length>20||/[<>\x00-\x1f]/.test(x)||forbid.test(x)))throw Error('Etsy requires 13 unique tags of at most 20 characters');
 if(type==='physical'&&tags.some(x=>/\b(?:digital download|printable file|svg file|instant download)\b/i.test(x)))
   throw Error('Physical print tags cannot promise downloads');
 if(type==='download'&&tags.some(x=>/\b(?:framed print|shipped poster|physical poster)\b/i.test(x)))
   throw Error('Digital tags cannot promise a shipped print');
 if(intro.length<35||intro.length>350||forbid.test(intro)||/[<>\x00-\x1f]/.test(intro))
   throw Error('Description opening is missing or unsupported');
 if(type==='physical'&&!/\b(?:physical|printed|shipped|print|poster)\b/i.test(intro))
   throw Error('Description opening must identify a printed product');
 if(type==='download'&&!/\b(?:digital|download|file|pattern)\b/i.test(intro))
   throw Error('Description opening must identify a digital product');
 if(type==='physical'&&/\b(?:instant download|digital download|no physical item)\b/i.test(intro))
   throw Error('Physical description cannot offer digital downloads');
 if(type==='download'&&/\b(?:framed|shipped|physical print)\b/i.test(intro))
   throw Error('Digital description cannot promise delivery');
 return {title,tags,intro};
}
export const proposalHash=(row,proposal)=>hash([row.id,row.fingerprint,row.type,proposal]);
export async function prepareCurrentSeoAudit({client,uploads,id,clock=()=>Date.now()}){
 const queued=await uploads.get(CURRENT_SEO,{type:'json',consistency:'strong'});
 if(!queued||queued.phase!=='queued'||queued.id!==id)throw Error('SEO audit request changed');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||!positive(seller.shop_id))throw Error('Wrong Etsy seller');
 const all=[],seen=new Set();
 for(let offset=0;offset<250;offset+=100){
  const page=await client.api('/shops/'+seller.shop_id+'/listings/active?'+new URLSearchParams({limit:'100',offset:String(offset)}));
  if(!Array.isArray(page?.results)||page.results.length>100)throw Error('Live seller catalogue unavailable');
  for(const record of page.results){
   if(!positive(record.listing_id)||seen.has(record.listing_id)||record.shop_id!==seller.shop_id||record.state!=='active')throw Error('Live seller catalogue changed');
   seen.add(record.listing_id);all.push(record.listing_id);
  }
  if(page.results.length<100)break;
  if(offset===200)throw Error('Catalogue exceeds safe 250-listing review limit');
 }
 const rows=[];
 for(let start=0;start<all.length;start+=4){
  const chunk=await Promise.all(all.slice(start,start+4).map(async id=>{
   try{
    const [item,photos]=await Promise.all([client.api('/listings/'+id),client.api('/listings/'+id+'/images')]);
    if(item.listing_id!==id||item.shop_id!==seller.shop_id||item.state!=='active'||!knownType(item.listing_type)||
      !Array.isArray(item.tags)||item.tags.length>13||typeof item.description!=='string'||typeof item.title!=='string')
      throw Error('This listing is not a supported active product');
    const first=photos?.results?.slice()?.sort((a,b)=>a.rank-b.rank)[0];
    const url=first?.url_570xN||first?.url_fullxfull;
    return {id,title:item.title,type:item.listing_type,tags:item.tags,description:item.description,
      imageUrl:validImageUrl(url)?url:null,trio:item.listing_type==='physical'&&/\b(?:trio|set of 3|set of three)\b/i.test(item.title),
      fingerprint:fingerprint(item),sourceAt:clock(),status:validImageUrl(url)?'pending':'image_unavailable'};
   }catch{return {id,title:'Etsy listing '+id,type:'unknown',status:'blocked',reason:'Seller listing or image could not be verified'};}
  }));
  rows.push(...chunk);
 }
 const state={version:1,id,phase:'ready',shopId:seller.shop_id,checkedAt:clock(),rows};
 await uploads.setJSON(CURRENT_SEO,state);
 return {phase:'ready',count:rows.length,ready:rows.filter(x=>x.status==='pending').length};
}
async function verifyInventoryOrFiles(client,shopId,item){
 if(item.listing_type==='download'){
  const file=await client.api('/shops/'+shopId+'/listings/'+item.listing_id+'/files');
  if(!Array.isArray(file?.results))throw Error('Digital files unavailable');
  return {type:'download',files:file.results.map(x=>[x.listing_file_id,x.filename,x.size_bytes]).sort((a,b)=>a[0]-b[0])};
 }
 const inventory=await client.api('/listings/'+item.listing_id+'/inventory');
 if(!inventory||!Array.isArray(inventory.products))throw Error('Physical inventory unavailable');
 return {type:'physical',inventory:inventory.products};
}
export async function applyCurrentSeoApproval({client,uploads,id,clock=()=>Date.now()}){
 const approval=await uploads.get(approvalKey(id),{type:'json',consistency:'strong'});
 const state=await uploads.get(CURRENT_SEO,{type:'json',consistency:'strong'});
 const row=state?.rows?.find(x=>x.id===approval?.listingId);
 if(!approval||!state||state.id!==approval.auditId||clock()-state.checkedAt>86400000||
    !row||row.status!=='apply_queued'||row.applyId!==id||
    !row.proposal||row.proposalHash!==approval.proposalHash||
    proposalHash(row,row.proposal)!==approval.proposalHash)throw Error('SEO approval expired or changed');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||seller.shop_id!==state.shopId)throw Error('Wrong Etsy seller');
 const item=await client.api('/listings/'+row.id);
 if(item.shop_id!==seller.shop_id||item.state!=='active'||item.listing_type!==row.type||
    fingerprint(item)!==row.fingerprint)throw Error('Listing changed since SEO review; no update made');
 const originalCheck=await verifyInventoryOrFiles(client,seller.shop_id,item);
 const nextDescription=approval.includeIntro?row.proposal.intro+'\n\n'+item.description:item.description;
 if(nextDescription.length>10000)throw Error('Description too long; review without changing original');
 const body={title:row.proposal.title,tags:row.proposal.tags.join(',')};
 if(approval.includeIntro)body.description=nextDescription;
 // Mark first attempt before PATCH: an uncertain provider response cannot be replayed.
 await uploads.setJSON(CURRENT_SEO,{...state,rows:state.rows.map(x=>x.id===row.id?{...x,status:'sending'}:x)});
 const args=new URLSearchParams(body);
 await client.api('/shops/'+seller.shop_id+'/listings/'+row.id,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:args.toString()});
 const after=await client.api('/listings/'+row.id);
 const afterCheck=await verifyInventoryOrFiles(client,seller.shop_id,after);
 if(protectedFields(after)!==protectedFields(item)||JSON.stringify(afterCheck)!==JSON.stringify(originalCheck)||
    after.title!==row.proposal.title||after.description!==nextDescription||
    new Set(after.tags.map(t=>t.toLowerCase())).size!==row.proposal.tags.length||
    !row.proposal.tags.every(tag=>after.tags.some(x=>x.toLowerCase()===tag.toLowerCase())))
   throw Error('Etsy metadata or protected fields did not read back exactly');
 const current=await uploads.get(CURRENT_SEO,{type:'json',consistency:'strong'});
 if(current?.id!==state.id)throw Error('Audit changed after Etsy update; investigate');
 await uploads.setJSON(CURRENT_SEO,{...current,rows:current.rows.map(x=>x.id===row.id?{...x,status:'updated',updatedAt:clock()}:x)});
 return {id:row.id,status:'updated'};
}
export async function markCurrentSeoFailure({uploads,id,clock=()=>Date.now()}){
 const state=await uploads.get(CURRENT_SEO,{type:'json',consistency:'strong'});
 if(!state?.rows?.some(x=>x.applyId===id))return;
 await uploads.setJSON(CURRENT_SEO,{...state,rows:state.rows.map(x=>x.applyId===id&&x.status!=='updated'?{
  ...x,status:'needs_investigation',reason:'The Etsy update could not be verified; inspect the live listing before another attempt',checkedAt:clock()
 }:x)});
}
