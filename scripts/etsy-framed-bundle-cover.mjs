// Reuse the exact, already approved individual artwork mockup pixels for framed
// collection lead photos. No recreation or alterations to poster illustration/verse.
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sets=[
 {name:'Forest Friends',listingId:4600180569,sku:'SP-TRIO-D1B581C8843C136EF3744B3D',
  id:'iAYzKSdFwyt892qFAPqkXIdnO0K5kUYT',oldCoverId:8717066198},
 {name:'Hidden Paths',listingId:4600182933,sku:'SP-TRIO-7AD9AD4192AB53D36FCE3CC6',
  id:'4ZNZ8-zhwgsRgJknNJsX3a8FnJmtdP9T',oldCoverId:8717084020}
];
function drawScene(title){
 const rects=[177,626,1075].map((x,i)=>{
  const y=225,w=348,h=524;
  return `<rect x="${x+14}" y="${y+19}" width="${w}" height="${h}" rx="3" fill="#62533f" opacity=".16"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#wood)" stroke="#725337" stroke-width="3"/>
  <rect x="${x+12}" y="${y+12}" width="${w-24}" height="${h-24}" fill="#ead4b4"/>
  <rect x="${x+21}" y="${y+21}" width="${w-42}" height="${h-42}" fill="#f6f3ed"/> `;
 }).join('');
 return Buffer.from(`<svg width="1600" height="1120" xmlns="http://www.w3.org/2000/svg">
 <defs>
  <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f3f0e8"/><stop offset="1" stop-color="#ddd5c5"/></linearGradient>
  <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#b78858"/><stop offset=".4" stop-color="#e5bc80"/><stop offset="1" stop-color="#a97a4e"/></linearGradient>
 </defs>
 <rect width="1600" height="1120" fill="url(#wall)"/>
 <rect x="0" y="870" width="1600" height="250" fill="#d2c4b0"/>
 <rect x="0" y="861" width="1600" height="10" fill="#b1a189"/>
 <text x="800" y="103" fill="#294d40" font-family="Georgia,serif" font-size="65" font-weight="bold" text-anchor="middle">${title.toUpperCase()}</text>
 <text x="800" y="154" fill="#5a655c" font-family="sans-serif" font-size="24" text-anchor="middle">BRITISH WOODLAND VERSES — SET OF THREE</text>
 ${rects}
 <rect x="80" y="934" width="1440" height="112" rx="14" fill="#faf8f3" opacity=".95"/>
 <text x="800" y="982" fill="#263d33" font-family="sans-serif" font-size="31" font-weight="bold" text-anchor="middle">THREE SEPARATE UNFRAMED A4 PRINTS</text>
 <text x="800" y="1024" fill="#5e655f" font-family="sans-serif" font-size="24" text-anchor="middle">Frames shown for display only — frames are not included</text>
 </svg>`);
}
export async function framedBundleCovers({uploads,client,mode='preview',onlyListingId=null}){
 if(!['preview','apply'].includes(mode))throw Error('Invalid photo operation');
 const {default:sharp}=await import('sharp');
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints')throw Error('Wrong seller');
 for(const set of sets){
  if(onlyListingId!==null&&set.listingId!==onlyListingId)continue;
  const state=await uploads.get('uploads/'+set.id+'/state',{type:'json',consistency:'strong'});
  if(state?.type!=='physical_bundle'||state.listingId!==set.listingId||state.sku!==set.sku||
   state.phase!=='published'||state.plan?.previewHashes?.length!==4||
   state.trio?.size!=='A4')throw Error('Bundle private original state unavailable '+set.name);
  const live=await client.api('/listings/'+set.listingId);
  const gallery=await client.api('/listings/'+set.listingId+'/images');
  if(live.state!=='active'||live.shop_id!==seller.shop_id||live.listing_type!=='physical'||
   !live.description?.includes('unframed')||!live.description?.includes('frames')||
   ![4,5].includes(gallery.results?.length)||!gallery.results.some(x=>x.listing_image_id===set.oldCoverId))
   throw Error('Bundle Etsy listing or disclosure changed '+set.name);
  const marker='Sapiver Prints '+set.name+' three unframed A4 posters shown in oak frames for display only. Frames are not included.';
  const prior=gallery.results.filter(i=>i.alt_text===marker);
  if(prior.length>1)throw Error('Duplicate marketing image needs review '+set.name);
  if(prior.length===1){
   if(gallery.results.find(x=>x.rank===1)?.listing_image_id!==prior[0].listing_image_id)
    throw Error('Existing framed display photo is not rank one '+set.name);
   console.log('BUNDLE_FRAME_ALREADY_LIVE '+set.listingId);continue;
  }
  if(gallery.results.length!==4||gallery.results.find(x=>x.rank===1)?.listing_image_id!==set.oldCoverId)
   throw Error('Bundle gallery no longer matches source four images '+set.name);
  const art=[];
  for(let i=1;i<=3;i++){
   const b=Buffer.from(await uploads.get('uploads/'+set.id+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'}));
   if(!b.length||sha(b)!==state.plan.previewHashes[i])throw Error('Original bundle source photo changed '+set.name);
   art.push(await sharp(b).resize(304,449,{fit:'contain',background:'#ffffff'}).jpeg({quality:95}).toBuffer());
  }
  const spots=[{left:199,top:259},{left:648,top:259},{left:1097,top:259}];
  const scene=drawScene(set.name);
  const full=await sharp(scene).composite(art.map((input,i)=>({input,...spots[i]})))
   .jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer();
  if(full.length>5_000_000)throw Error('Marketing file too large');
  const result=await sharp(full).metadata();
  if(result.width!==1600||result.height!==1120)throw Error('Invalid marketing file size');
  if(mode==='preview'){
   const preview=await sharp(full).resize(620).jpeg({quality:68}).toBuffer();
   console.log('BUNDLE_FRAME_PREVIEW '+set.listingId+' '+preview.toString('base64'));
  }else{
   const form=new FormData();
   form.set('image',new Blob([full],{type:'image/jpeg'}),set.sku+'-framed-lifestyle.jpg');
   form.set('rank','1');form.set('alt_text',marker);
   const posted=await client.api('/shops/'+seller.shop_id+'/listings/'+set.listingId+'/images',{method:'POST',body:form});
   if(!posted.listing_image_id)throw Error('Etsy marketing upload outcome uncertain. Inspect before any retry');
   // Etsy can keep the previous photo at rank 1 alongside a newly uploaded
   // rank-1 cover. Demote only the known old cover; do not upload again.
   const demote=new FormData();
   demote.set('listing_image_id',String(set.oldCoverId));
   demote.set('rank','5');
   await client.api('/shops/'+seller.shop_id+'/listings/'+set.listingId+'/images',{method:'POST',body:demote});
   let confirmed=false;
   for(let t=0;t<20;t++){
    const res=await client.api('/listings/'+set.listingId+'/images');
    if(res.results?.length===5&&res.results.find(x=>x.rank===1)?.listing_image_id===posted.listing_image_id&&
     res.results.find(x=>x.listing_image_id===set.oldCoverId)?.rank!==1){
     confirmed=true;break;
    }
    await new Promise(resolve=>setTimeout(resolve,1200));
   }
   console.log('BUNDLE_FRAME_POSTED '+JSON.stringify({listingId:set.listingId,newImageId:posted.listing_image_id,confirmed,oldArtworkRetained:true}));
   if(!confirmed)throw Error('Etsy still processing the new framed cover. Do not reupload');
  }
 }
 console.log('BUNDLE_FRAMED_COVERS_COMPLETE '+mode);
}
