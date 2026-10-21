// Recover the SAME owner-approved Woodland setup from a failure that occurred
// before supplier registration. Never re-run an uncertain provider creation.
import {listProducts} from './product-records.mjs';
const ID=/^[A-Za-z0-9_-]{32}$/;
const SOURCE=['badger','red-squirrel','roe-deer'];
const fail=msg=>{throw Error(msg);};
export async function safelyResumeWoodlandTwo({id,uploads,dispatch,clock=()=>Date.now()}){
 if(!ID.test(id||''))fail('Invalid retained Woodland request');
 const key='woodland-request/'+id;
 const stored=await uploads.getWithMetadata(key,{type:'json',consistency:'strong'});
 const state=stored?.data;
 if(state?.phase!=='needs_investigation'||state.stage!=='stopped_safely'||!state.input?.confirmed||
  !state.input?.existingOnly||state.ids?.length||state.input.items?.length!==6)
  fail('This Woodland request is not safe to restart automatically');
 const original=await uploads.get('woodland-six-20261021/state',{type:'json',consistency:'strong'});
 if(original?.phase!=='ready'||original.pages?.length!==6)fail('Original six artwork hashes unavailable');
 for(const slug of SOURCE){
  const x=state.input.items.find(item=>String(item.folder||'').split('/').at(-1)===slug);
  if(!x||!/^[a-f0-9]{64}$/.test(x.sha256||'')||
   !original.pages.some(p=>p.slug===slug&&p.sha256===x.sha256))
   fail('Original '+slug+' artwork differs from retained request');
  const sku='SP-WOOD-'+slug.toUpperCase()+'-'+x.sha256.slice(0,10).toUpperCase();
  const claim=await uploads.get('supplier-only/'+sku,{type:'json',consistency:'strong'});
  if(claim)fail('Existing '+slug+' supplier registration requires investigation; no retry');
 }
 // Some errors can occur after a bundle reservation but before its ID is
 // copied to the request. Inspect all tracked product records as well.
 const products=await listProducts(uploads);
 for(const product of products){
  if(product.type!=='physical_bundle')continue;
  const revision=product.pendingRevision||product.currentRevision;
  if(!ID.test(revision||''))continue;
  const asset=await uploads.get('uploads/'+revision+'/state',{type:'json',consistency:'strong'});
  if(asset?.bundlesOnly&&asset.memberRefs?.some(member=>state.input.items.some(x=>x.sha256===member.sha256)))
   fail('An existing Woodland bundle review is already reserved; inspect IDs before retry');
 }
 const next={...state,phase:'queued',stage:'safely_resumed_pre_supplier',updatedAt:clock(),resumeCount:1};
 const changed=await uploads.setJSON(key,next,{onlyIfMatch:stored.etag});
 if(changed?.modified!==true)fail('Another worker changed this setup; inspect before retry');
 try{
  await dispatch(id,'woodland_two_setup');
 }catch{
  await uploads.setJSON(key,{...next,phase:'dispatch_uncertain',stage:'worker_dispatch_unconfirmed',updatedAt:clock()});
  return {id,phase:'dispatch_uncertain',notice:'Saved request retained, worker start unconfirmed. Do not create a second request.'};
 }
 return {id,phase:'queued',notice:'Same approved two-bundle setup safely resumed. No individual listings created.'};
}
