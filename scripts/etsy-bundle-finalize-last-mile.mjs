// Controlled Woodland Etsy bundle-cover reconciliation (no Netlify build).
// Safeguards: exact two listing IDs, existing gallery images, no SKU/price changes.
const sets=[
 {name:'Forest Friends',id:4600180569,sku:'SP-TRIO-D1B581C8843C136EF3744B3D',original:8717066198,framed:8717651560},
 {name:'Hidden Paths',id:4600182933,sku:'SP-TRIO-7AD9AD4192AB53D36FCE3CC6',original:8717084020,framed:null}
];
const marker=x=>'Sapiver Prints '+x.name+' three unframed A4 posters shown in oak frames for display only. Frames are not included.';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stop=x=>{throw Error(x)};
async function inspect(client,seller,set){
 const l=await client.api('/listings/'+set.id);
 if(l.shop_id!==seller.shop_id||l.state!=='active'||l.listing_type!=='physical')stop('Bundle identity changed '+set.id);
 const inv=await client.api('/listings/'+set.id+'/inventory');
 const products=inv.products?.filter(x=>!x.is_deleted)||[];
 if(products.length!==1||products[0].sku!==set.sku)stop('Supplier SKU changed '+set.id);
 const g=await client.api('/listings/'+set.id+'/images');
 if(!Array.isArray(g.results)||![4,5].includes(g.results.length)||!g.results.some(x=>x.listing_image_id===set.original))
  stop('Source cover missing '+set.id);
 const promos=g.results.filter(x=>x.alt_text===marker(set));
 if(promos.length>1)stop('Duplicate framed covers found '+set.id);
 const first=g.results.filter(x=>x.rank===1),old=g.results.find(x=>x.listing_image_id===set.original);
 const framed=promos[0]||null;
 return {id:set.id,images:g.results.map(x=>({id:x.listing_image_id,rank:x.rank,marker:x.alt_text===marker(set)})),
  lead:first.map(x=>x.listing_image_id),oldRank:old.rank,framed:framed?.listing_image_id||null,
  framedRank:framed?.rank||null,ok:g.results.length===5&&framed?.rank===1&&old.rank>1&&first.length===1};
}
export async function finishBundleCovers({client,uploads,mode}){
 if(!['audit','fix_forest','finish_hidden','verify'].includes(mode))stop('Invalid one-off mode');
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))stop('Wrong Etsy shop');
 let states=[];
 for(const set of sets)states.push(await inspect(client,seller,set));
 console.log('BUNDLE_LAST_MILE_BEFORE '+JSON.stringify(states));
 if(mode==='audit'||mode==='verify'){
  console.log('BUNDLE_LAST_MILE_RESULT '+JSON.stringify({mode,states,allVerified:states.every(x=>x.ok)}));return;
 }
 if(mode==='fix_forest'){
  const set=sets[0],v=states[0];
  if(v.ok){console.log('BUNDLE_FOREST_ALREADY_CORRECT');return;}
  if(v.framed!==set.framed||v.images.length!==5||v.oldRank!==1||v.framedRank!==1||v.lead.length!==2)
   stop('Unexpected Forest image state; do not modify');
  // Explicitly reassign ONLY the original cover to rank 2. No deletion,
  // image upload or new listing image; framed image remains rank 1.
  const form=new FormData();form.set('listing_image_id',String(set.original));form.set('rank','2');
  const moved=await client.api('/shops/'+seller.shop_id+'/listings/'+set.id+'/images',{method:'POST',body:form});
  if(moved?.listing_image_id!==set.original)stop('Original image rank move not acknowledged');
  let settled=null;
  for(let n=0;n<20;n++){settled=await inspect(client,seller,set);if(settled.ok)break;await pause(1500);}
  console.log('BUNDLE_FOREST_AFTER '+JSON.stringify(settled));
  if(!settled.ok)stop('Etsy image ordering ambiguous after moving old cover; no retry without inspection');
  return;
 }
 if(mode==='finish_hidden'){
  if(!states[0].ok)stop('Forest Friends not yet unambiguously framed first');
  const h=states[1];
  if(h.ok){console.log('BUNDLE_HIDDEN_ALREADY_CORRECT');return;}
  if(h.framed||h.images.length!==4||h.oldRank!==1)stop('Hidden Paths already has an uncertain image; no duplicate upload');
  // Existing source-art function validates approved original hashes and
  // writes ONE framed cover. It will skip Forest when its marker is rank1.
  const {framedBundleCovers}=await import('./etsy-framed-bundle-cover.mjs');
  try{await framedBundleCovers({uploads,client,mode:'apply'});}
  catch(e){console.log('BUNDLE_HIDDEN_UPLOAD_UNCERTAIN');}
  let settled=null;
  for(let n=0;n<15;n++){
   settled=await inspect(client,seller,sets[1]);
   if(settled.ok)break;
   if(!settled.framed)break;
   await pause(1300);
  }
  console.log('BUNDLE_HIDDEN_AFTER '+JSON.stringify(settled));
  if(!settled.ok)stop('Etsy image upload/order not fully confirmed; inspect before any retry');
 }
}
