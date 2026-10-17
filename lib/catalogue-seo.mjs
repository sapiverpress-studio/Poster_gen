import {createHash,randomBytes} from 'node:crypto';
const name='SapiverPrints';
const validId=n=>Number.isSafeInteger(n)&&n>0;
const sameTags=(a,b)=>JSON.stringify([...a].map(v=>v.toLowerCase()).sort())===JSON.stringify([...b].map(v=>v.toLowerCase()).sort());
const checksum=listing=>createHash('sha256').update(JSON.stringify([listing.shop_id,listing.listing_id,listing.state,listing.listing_type,listing.title,listing.tags,listing.taxonomy_id])).digest('hex');
const assertListing=(listing,shopId)=>{
 if(!validId(listing?.listing_id)||listing.shop_id!==shopId||listing.state!=='active'||listing.listing_type!=='physical'||!Array.isArray(listing.tags)||listing.tags.length>13||typeof listing.title!=='string')throw Error('Etsy listing state or tags need individual investigation');
};
export function validateSeoProposals(body){
 if(body?.shop&&body.shop!==name)throw Error('Wrong Etsy shop in proposals');
 if(!Array.isArray(body?.data)||body.data.length<1||body.data.length>100)throw Error('Expected 1 to 100 listing proposals');
 const ids=new Set();
 return body.data.map(row=>{
  const id=Number(row.listing_id),title=String(row.suggested_title||'').trim(),old=String(row.existing_title||'').trim(),tags=row.suggested_tags;
  if(!validId(id)||ids.has(id)||!title||title.length>140||!old||old.length>140||!/\b(?:prints?|posters?|wall art)\b/i.test(title)||!Array.isArray(tags)||tags.length!==13||tags.some(v=>typeof v!=='string'||!v.trim()||v.length>20||/[\x00-\x1f<>]/.test(v))||new Set(tags.map(v=>v.toLowerCase())).size!==13)throw Error('Listing proposal IDs, titles or 13 tags are invalid');
  ids.add(id);return {id,title,old,tags:[...tags],note:String(row.review_note||'').slice(0,400)};
 });
}
export async function prepareSeoAudit({client,uploads,manifest,clock=()=>Date.now()}){
 const rows=validateSeoProposals(manifest),seller=await client.session();
 if(seller.shop_name!==name||!validId(seller.shop_id))throw Error('Wrong Etsy seller');
 const actual=[],pageSize=100;
 for(let offset=0;offset<=1000;offset+=pageSize){
  const page=await client.api('/shops/'+seller.shop_id+'/listings?'+new URLSearchParams({state:'active',limit:String(pageSize),offset:String(offset)}));
  if(!Number.isSafeInteger(page?.count)||!Array.isArray(page.results)||page.count>1000)throw Error('Etsy catalogue is unavailable or too large');
  actual.push(...page.results.map(x=>x.listing_id));if(actual.length>=page.count)break;
  if(!page.results.length)throw Error('Etsy catalogue pagination incomplete');
 }
 if(actual.length!==rows.length||new Set(actual).size!==actual.length||rows.some(r=>!actual.includes(r.id)))throw Error('Live Etsy catalogue differs from proposal file. Refresh all listings before editing.');
 // Bound concurrency rather than sending one request per listing at once.
 const details=[];
 for(let offset=0;offset<rows.length;offset+=4)details.push(...await Promise.all(rows.slice(offset,offset+4).map(row=>client.api('/listings/'+row.id))));
 const proposed=rows.map((row,i)=>{
  const l=details[i];assertListing(l,seller.shop_id);
  return {...row,before:{title:l.title,tags:l.tags,taxonomy_id:l.taxonomy_id},fingerprint:checksum(l),state:l.title===row.old?'ready':'changed_since_snapshot'};
 });
 const batch=randomBytes(16).toString('hex');
 await uploads.setJSON('seo/audit/'+batch,{shopId:seller.shop_id,at:clock(),rows:proposed},{onlyIfNew:true});
 return {batch,rows:proposed.map(({id,title,old,tags,note,before,state})=>({id,title,old,tags,note,before,state}))};
}
export async function applySeoUpdate({client,uploads,batch,id,clock=()=>Date.now()}){
 if(!/^[a-f0-9]{32}$/.test(batch)||!validId(id))throw Error('Invalid audit selection');
 const audit=await uploads.get('seo/audit/'+batch,{type:'json',consistency:'strong'});
 if(!audit||clock()-audit.at>86400000)throw Error('SEO audit expired; refresh all current listings');
 const row=audit.rows.find(r=>r.id===id);if(!row||row.state!=='ready')throw Error('Listing changed since public snapshot; no update sent');
 const seller=await client.session();if(seller.shop_name!==name||seller.shop_id!==audit.shopId)throw Error('Wrong Etsy seller');
 const current=await client.api('/listings/'+id);assertListing(current,seller.shop_id);
 if(checksum(current)!==row.fingerprint)throw Error('Listing details changed after audit; no update sent');
 if(current.title===row.title&&sameTags(current.tags,row.tags))return {id,state:'already_current'};
 // Backup original listing metadata before locking or writing.
 await uploads.setJSON('seo/backup/'+batch+'/'+id,{before:row.before,at:clock()},{onlyIfNew:true});
 const claim=await uploads.setJSON('seo/claim/'+batch+'/'+id,{phase:'sending',at:clock()},{onlyIfNew:true});
 if(claim?.modified!==true)throw Error('SEO update already attempted; inspect before retry');
 await client.api('/shops/'+seller.shop_id+'/listings/'+id,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({title:row.title,tags:row.tags.join(',')}).toString()});
 const read=await client.api('/listings/'+id);assertListing(read,seller.shop_id);
 if(read.title!==row.title||!sameTags(read.tags,row.tags))throw Error('Etsy update outcome uncertain; investigate without retry');
 await uploads.setJSON('seo/claim/'+batch+'/'+id,{phase:'complete',at:clock()});
 return {id,state:'updated'};
}
