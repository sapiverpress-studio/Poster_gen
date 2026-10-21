// Owner-authenticated export of six existing Canva verse artworks: no redraw, no Etsy publication.
// Each page is a standalone PNG export to avoid ambiguous multi-page ZIP structures.
import {Readable} from 'node:stream';
import {WOODLAND as OTHER_WOODLAND,details} from './woodland-verse-bulk.mjs';
import {parseTrioDetails,validateTwoTrios} from '../public/collection-trios.mjs';
import yazl from 'yazl';
import {inspectPNG,safeCanvaDownloadUrl} from './print-check.mjs';

export const WOODLAND_DESIGN='DAHYoJC71wA';
const KEY='woodland-six-20261021/state';
const PREFIX='woodland-six-20261021/';
const BASE='https://api.canva.com/rest/v1';
export const WOODLAND=[...[{"slug":"fox","name":"Red Fox","title":"Red Fox Woodland Verse Print | British Wildlife Poetry Wall Art","poem":["With russet coat and velvet tread,","Where leaves lie gold, he makes his bed.","His woodland kingdom, dusk and dew;","His crown, the stars that glimmer through."],"text":"An illustrated red fox beneath autumn woodland foliage, with an original four-line verse.","tags":["red fox print","fox wall art","woodland wall art","british wildlife","animal verse","bedroom wall art","woodland nursery","red fox poem","nature art print","forest animal art","fox lover gift","storybook decor","animal poetry"]},{"slug":"robin","name":"Robin","title":"Robin Woodland Verse Print | British Bird Poetry Nature Wall Art","poem":["With scarlet breast and velvet wing,","Upon the bough he sits to sing.","Though winter cloaks the woods in white,","His song shall greet the morning light."],"text":"An illustrated European robin on a woodland bough with an original four-line verse.","tags":["robin art print","robin wall art","british bird art","british wildlife","animal verse","bedroom wall art","woodland nursery","robin poem","nature art print","garden bird print","bird lover gift","storybook decor","animal poetry"]},{"slug":"hedgehog","name":"Hedgehog","title":"Hedgehog Woodland Verse Print | British Wildlife Poetry Wall Art","poem":["With bristled cloak and footsteps small,","He wanders where the shadows fall.","Beneath the leaves, his pathways lie;","A quiet knight when stars are high."],"text":"An illustrated European hedgehog exploring autumn leaves with an original four-line verse.","tags":["hedgehog print","hedgehog wall art","woodland wall art","british wildlife","animal verse","bedroom wall art","woodland nursery","hedgehog poem","nature art print","forest animal art","hedgehog lover gift","storybook decor","animal poetry"]}],...OTHER_WOODLAND];

const sixDetails=p=>details(p).replace('Original Canva artwork, not newly generated or restyled.','Original artwork produced with AI assistance and artist review. This export preserves the approved Canva artwork; no new image generation takes place.');
function fileKey(p){return PREFIX+p.slug+'.png';}
async function api({token,request,path,method='GET',body}){
 const res=await request(BASE+path,{method,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
 if(!res.ok)throw Error('Canva export API unavailable ('+res.status+'); check connected Canva account and export permission');
 return await res.json();
}
export async function woodlandSixStart({uploads,token,request=fetch,clock=()=>Date.now()}){
 const existing=await uploads.get(KEY,{type:'json',consistency:'strong'});
 if(existing?.phase==='ready'||existing?.phase==='exporting'||existing?.phase==='in_progress'||existing?.phase==='finalizing')return {phase:existing.phase};
 const oldLimitError=/Original six PNGs exceed the importer|100 MB collection ZIP limit/i;
 if(existing&&!(existing.phase==='needs_review'&&oldLimitError.test(existing.reason||'')))throw Error('Previous export requires review; do not silently retry');
 let reserved;
 if(existing){
  const current=await uploads.getWithMetadata(KEY,{type:'json',consistency:'strong'});
  if(current?.data?.phase!=='needs_review'||!oldLimitError.test(current.data.reason||''))throw Error('Only the old size-limit export can be restarted');
  reserved=await uploads.setJSON(KEY,{phase:'exporting',designId:WOODLAND_DESIGN,startedAt:clock(),retry:'old_zip_limit'},{onlyIfMatch:current.etag});
 }else reserved=await uploads.setJSON(KEY,{phase:'exporting',designId:WOODLAND_DESIGN,startedAt:clock()},{onlyIfNew:true});
 if(!reserved.modified)throw Error('Export already started');
 try{
  const design=(await api({token,request,path:'/designs/'+WOODLAND_DESIGN})).design;
  if(design?.id!==WOODLAND_DESIGN)throw Error('Original woodland Canva design not accessible');
  const pageList=await api({token,request,path:'/designs/'+WOODLAND_DESIGN+'/pages?limit=8'});
  if(pageList?.items?.length!==6||pageList.items.some(p=>p.dimensions?.width!==3394||p.dimensions?.height!==4800))throw Error('Original six-page canvas changed');
  const jobs=[];
  for(let n=1;n<=6;n++){
   const j=(await api({token,request,path:'/exports',method:'POST',body:{design_id:WOODLAND_DESIGN,format:{type:'png',lossless:true,width:3394,pages:[n]}}})).job;
   if(typeof j?.id!=='string'||!j.id)throw Error('Canva did not accept page '+n+' export');
   jobs.push({page:n,id:j.id});
  }
  await uploads.setJSON(KEY,{phase:'in_progress',designId:WOODLAND_DESIGN,startedAt:clock(),jobs});
  return {phase:'in_progress',pages:6};
 }catch(e){
  await uploads.setJSON(KEY,{phase:'needs_review',reason:String(e.message).slice(0,155),at:clock()});
  throw e;
 }
}
export async function woodlandSixFinish({uploads,token,request=fetch,clock=()=>Date.now()}){
 const state=await uploads.get(KEY,{type:'json',consistency:'strong'});
 if(state?.phase==='ready')return {phase:'ready',pages:6};
 if(state?.phase!=='in_progress'||!Array.isArray(state.jobs)||state.jobs.length!==6)throw Error('No active six-page woodland Canva export');
 const jobs=[];
 for(const j of state.jobs){
  const status=(await api({token,request,path:'/exports/'+encodeURIComponent(j.id)})).job;
  if(status?.status==='failed')throw Error('Canva export failed for woodland page '+j.page);
  if(status?.status!=='success')return {phase:'in_progress',pagesReady:jobs.length};
  if(!Array.isArray(status.urls)||status.urls.length!==1||!safeCanvaDownloadUrl(status.urls[0]))throw Error('Canva did not return one trusted PNG per page');
  jobs.push({page:j.page,url:status.urls[0]});
 }
 const lock=await uploads.getWithMetadata(KEY,{type:'json',consistency:'strong'});
 if(lock?.data?.phase!=='in_progress')return {phase:lock?.data?.phase||'in_progress'};
 const claim=await uploads.setJSON(KEY,{...state,phase:'finalizing'}, {onlyIfMatch:lock.etag});
 if(!claim?.modified)return {phase:'in_progress'};
 try{
  const saved=[];let totalBytes=0;
  for(let i=0;i<6;i++){
   const result=await request(jobs[i].url,{redirect:'error',signal:AbortSignal.timeout(45000)});
   if(!result.ok)throw Error('Canva PNG download was unavailable');
   const buf=Buffer.from(await result.arrayBuffer());
   if(buf.length>40_000_000)throw Error('Canva artwork exceeds single-page safety limit');
   totalBytes+=buf.length;
   if(totalBytes>247000000)throw Error('Original six PNGs exceed the protected 247 MB collection limit. Do not upload an oversized archive.');
   const info=inspectPNG(buf);
   if(info.width!==3394||info.height!==4800)throw Error('Canva page did not export at approved A-series resolution');
   const key=fileKey(WOODLAND[i]);await uploads.set(key,buf);
   const readBack=await uploads.get(key,{type:'arrayBuffer',consistency:'strong'});
   if(inspectPNG(Buffer.from(readBack)).sha256!==info.sha256)throw Error('Canva artwork did not persist');
   saved.push({slug:WOODLAND[i].slug,bytes:buf.length,sha256:info.sha256,width:info.width,height:info.height});
  }
  await uploads.setJSON(KEY,{phase:'ready',designId:WOODLAND_DESIGN,createdAt:clock(),pages:saved});
  return {phase:'ready',pages:6};
 }catch(e){
  await uploads.setJSON(KEY,{phase:'needs_review',reason:'Canva export not fully verified: '+String(e.message).slice(0,120),at:clock()});
  throw e;
 }
}
export async function woodlandSixStatus({uploads}){
 const state=await uploads.get(KEY,{type:'json',consistency:'strong'});
 return {phase:state?.phase||'not_started',pages:state?.phase==='ready'?6:0,...state?.phase==='needs_review'?{reason:state.reason}:{}};
}

export const WOODLAND_CHUNK_BYTES=3000000;
export const WOODLAND_TRIO_TEXTS=["Title: Woodland Verse - Forest Friends\nListing title: Woodland Verse Prints - Fox Robin Hedgehog Set of 3 A4 Nature Posters\nSection: Nature\nSize: A4\nMembers: fox, robin, hedgehog\nTags: fox woodland art, robin bird print, hedgehog art, british wildlife, nature verse set, woodland nursery, forest animal art, nature wall prints, fox lover gift, garden bird art, wildlife poem art, set of three art, unframed print set\n\nDescription:\nThree different original British woodland wildlife verse illustrations: a red fox, a robin and a hedgehog. Each print has its own four-line original poem. This listing is one physical A4 set of three unframed prints, delivered as three separate paper posters. No frames or mounts are included. This is not a digital download. Artwork created with AI assistance and artist review; printing and dispatch are completed by our disclosed production partner.","Title: Woodland Verse - Hidden Paths\nListing title: Woodland Verse Prints - Badger Red Squirrel Roe Deer Set of 3 A4 Posters\nSection: Nature\nSize: A4\nMembers: badger, red-squirrel, roe-deer\nTags: badger wall art, red squirrel print, roe deer print, british wildlife, nature verse prints, woodland animal art, forest wall prints, woodland print set, cottage wall decor, nursery nature art, badger lover gift, animal nursery art, unframed art set\n\nDescription:\nA different trio of original British woodland verse illustrations: a European badger, a red squirrel and an adult roe deer doe. Each print has its own four-line poem. This listing is one physical A4 set of three unframed paper prints, not a single collage or a digital file. No frames or mounts are included. Artwork created with AI assistance and reviewed for animal identity and text by Sapiver Prints. Our disclosed print partner completes production and dispatch."];
export async function woodlandSixManifest({uploads}){
 const state=await uploads.get(KEY,{type:'json',consistency:'strong'});
 if(state?.phase!=='ready'||state?.pages?.length!==6)throw Error('Six original Canva exports not ready');
 if(state.pages.reduce((n,p)=>n+p.bytes,0)>247000000)throw Error('Original collection exceeds client ZIP bound');
 const images=WOODLAND.map(p=>{
  const x=state.pages.find(row=>row.slug===p.slug);
  if(!x||!Number.isInteger(x.bytes)||x.bytes<33||x.bytes>40000000||!/^[a-f0-9]{64}$/.test(x.sha256)||x.width!==3394||x.height!==4800)throw Error('Original image metadata failed validation');
  return {slug:p.slug,bytes:x.bytes,sha256:x.sha256,details:sixDetails(p)};
 });
 return {phase:'ready',images,bundles:WOODLAND_TRIO_TEXTS,chunkSize:WOODLAND_CHUNK_BYTES,maximumZipBytes:250000000};
}
export async function woodlandSixChunk({uploads,slug,part}){
 const m=await woodlandSixManifest({uploads}),item=m.images.find(x=>x.slug===slug);
 if(!item||!Number.isSafeInteger(part)||part<0||part>=Math.ceil(item.bytes/m.chunkSize))throw Error('Invalid original image chunk');
 const bytes=Buffer.from(await uploads.get(PREFIX+slug+'.png',{type:'arrayBuffer',consistency:'strong'}));
 if(bytes.length!==item.bytes||inspectPNG(bytes).sha256!==item.sha256)throw Error('Stored original image hash mismatch');
 const start=part*m.chunkSize,end=Math.min(start+m.chunkSize,bytes.length);
 return new Response(bytes.subarray(start,end),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="original-chunk.bin"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}

export async function woodlandSixDownload({uploads}){
 const state=await uploads.get(KEY,{type:'json',consistency:'strong'});
 if(state?.phase!=='ready'||state?.pages?.length!==6)throw Error('All six original Canva PNGs must pass verification before download');
 if(state.pages.some(p=>!Number.isSafeInteger(p.bytes)||p.bytes<=0)||state.pages.reduce((n,p)=>n+p.bytes,0)>247000000)throw Error('Six-original collection ZIP exceeds bulk importer capacity');
 const zip=new yazl.ZipFile();
 for(const p of WOODLAND){
  const image=Buffer.from(await uploads.get(fileKey(p),{type:'arrayBuffer',consistency:'strong'}));
  const info=inspectPNG(image),ref=state.pages.find(x=>x.slug===p.slug);
  if(info.sha256!==ref?.sha256||info.width!==3394||info.height!==4800)throw Error('Private Canva artwork failed integrity check');
  zip.addBuffer(image,p.slug+'/poster.png',{compress:false});
  zip.addBuffer(Buffer.from(sixDetails(p),'utf8'),p.slug+'/details.md');
 }
 // Validate membership, sizes, AI disclosure and uniqueness at package time.
 const trios=[parseTrioDetails("Title: Woodland Verse - Forest Friends\nListing title: Woodland Verse Prints - Fox Robin Hedgehog Set of 3 A4 Nature Posters\nSection: Nature\nSize: A4\nMembers: fox, robin, hedgehog\nTags: fox woodland art, robin bird print, hedgehog art, british wildlife, nature verse set, woodland nursery, forest animal art, nature wall prints, fox lover gift, garden bird art, wildlife poem art, set of three art, unframed print set\n\nDescription:\nThree different original British woodland wildlife verse illustrations: a red fox, a robin and a hedgehog. Each print has its own four-line original poem. This listing is one physical A4 set of three unframed prints, delivered as three separate paper posters. No frames or mounts are included. This is not a digital download. Artwork created with AI assistance and artist review; printing and dispatch are completed by our disclosed production partner."),parseTrioDetails("Title: Woodland Verse - Hidden Paths\nListing title: Woodland Verse Prints - Badger Red Squirrel Roe Deer Set of 3 A4 Posters\nSection: Nature\nSize: A4\nMembers: badger, red-squirrel, roe-deer\nTags: badger wall art, red squirrel print, roe deer print, british wildlife, nature verse prints, woodland animal art, forest wall prints, woodland print set, cottage wall decor, nursery nature art, badger lover gift, animal nursery art, unframed art set\n\nDescription:\nA different trio of original British woodland verse illustrations: a European badger, a red squirrel and an adult roe deer doe. Each print has its own four-line poem. This listing is one physical A4 set of three unframed paper prints, not a single collage or a digital file. No frames or mounts are included. Artwork created with AI assistance and reviewed for animal identity and text by Sapiver Prints. Our disclosed print partner completes production and dispatch.")];
 validateTwoTrios(WOODLAND.map(p=>({folder:p.slug,printSizes:['A5','A4'],sectionTitle:'Nature',listingTitle:p.title})),trios);
 zip.addBuffer(Buffer.from("Title: Woodland Verse - Forest Friends\nListing title: Woodland Verse Prints - Fox Robin Hedgehog Set of 3 A4 Nature Posters\nSection: Nature\nSize: A4\nMembers: fox, robin, hedgehog\nTags: fox woodland art, robin bird print, hedgehog art, british wildlife, nature verse set, woodland nursery, forest animal art, nature wall prints, fox lover gift, garden bird art, wildlife poem art, set of three art, unframed print set\n\nDescription:\nThree different original British woodland wildlife verse illustrations: a red fox, a robin and a hedgehog. Each print has its own four-line original poem. This listing is one physical A4 set of three unframed prints, delivered as three separate paper posters. No frames or mounts are included. This is not a digital download. Artwork created with AI assistance and artist review; printing and dispatch are completed by our disclosed production partner."),'bundle-1.md',{compress:false});
 zip.addBuffer(Buffer.from("Title: Woodland Verse - Hidden Paths\nListing title: Woodland Verse Prints - Badger Red Squirrel Roe Deer Set of 3 A4 Posters\nSection: Nature\nSize: A4\nMembers: badger, red-squirrel, roe-deer\nTags: badger wall art, red squirrel print, roe deer print, british wildlife, nature verse prints, woodland animal art, forest wall prints, woodland print set, cottage wall decor, nursery nature art, badger lover gift, animal nursery art, unframed art set\n\nDescription:\nA different trio of original British woodland verse illustrations: a European badger, a red squirrel and an adult roe deer doe. Each print has its own four-line poem. This listing is one physical A4 set of three unframed paper prints, not a single collage or a digital file. No frames or mounts are included. Artwork created with AI assistance and reviewed for animal identity and text by Sapiver Prints. Our disclosed print partner completes production and dispatch."),'bundle-2.md',{compress:false});
 zip.end();
 return new Response(Readable.toWeb(zip.outputStream),{
  headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="Sapiver_Woodland_Verses_Six_Posters_Two_A4_Trios.zip"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
 });
}
