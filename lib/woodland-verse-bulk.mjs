// Owner-authenticated export of three existing Canva verse artworks: no redraw, no Etsy publication.
// Each page is a standalone PNG export to avoid ambiguous multi-page ZIP structures.
import {Readable} from 'node:stream';
import yazl from 'yazl';
import {inspectPNG,safeCanvaDownloadUrl} from './print-check.mjs';

export const WOODLAND_DESIGN='DAHYixMhTJc';
const KEY='woodland-verse-20261020/state';
const PREFIX='woodland-verse-20261020/';
const BASE='https://api.canva.com/rest/v1';
export const WOODLAND=[
 {slug:'badger',name:'Badger',title:'Badger Woodland Wildlife Verse Print | British Nature Poetry Wall Art',
 poem:['With silver stripes upon his face,','He walks the woods with solemn grace.','By ancient roots his chambers lie,','Concealed beneath the starlit sky.'],
 text:'A European badger walks among woodland roots, accompanied by a four-line original poem.',
 tags:['badger print','woodland wall art','british wildlife','badger poem','animal verse','woodland nursery','bedroom wall art','nature wall print','english countryside','badger lover gift','storybook print','forest animal art','animal poetry']},
 {slug:'red-squirrel',name:'Red Squirrel',title:'Red Squirrel Woodland Verse Print | British Wildlife Nature Poetry Wall Art',
 poem:['With russet tail and nimble feet,','He leaps where ancient branches meet.','He hides his stores where none may see,','Then sleeps within his lofty tree.'],
 text:'An illustrated red squirrel in a British woodland, with an original four-line verse.',
 tags:['red squirrel print','squirrel wall art','woodland wall art','british wildlife','animal verse','bedroom wall art','woodland nursery','red squirrel poem','nature art print','forest animal art','squirrel lover gift','storybook decor','animal poetry']},
 {slug:'roe-deer',name:'Roe Deer',title:'Roe Deer British Woodland Verse Print | Nature Poetry Wall Art',
 poem:['Where morning veils the fern and tree,','A roe deer steps upon the lea.','With watchful eyes and footsteps light,','It fades like mist beyond our sight.'],
 text:'A roe deer in a gentle woodland scene, accompanied by an original four-line verse.',
 tags:['roe deer print','woodland wall art','british wildlife','roe deer poem','animal verse','deer wall art','bedroom wall art','woodland nursery','forest animal art','storybook print','country nature art','deer lover gift','animal poetry']}
];
export const details=(p)=>{
 if(p.tags.length!==13||new Set(p.tags).size!==13||p.tags.some(x=>x.length>20))throw Error('Invalid Etsy tags');
 return 'Title: '+p.name+'\nListing title: '+p.title+'\nSection: Nature\nSizes: A5, A4\nTags: '+p.tags.join(', ')+'\n\nDescription:\n'+p.text+
 '\n\nTHE ORIGINAL VERSE\n'+p.poem.join('\n')+
 '\n\nA physical paper poster intended for a bedroom, nursery reading corner or cosy nature-themed room. No digital download is included. Choose A5 (148 × 210 mm) or A4 (210 × 297 mm), with the selected frame option where available. The artwork is sold individually as part of the coordinated eight-subject Woodland Verses range. Colours can differ between screens and paper. Original Canva artwork, not newly generated or restyled.\n';
};
function fileKey(p){return PREFIX+p.slug+'.png';}
async function api({token,request,path,method='GET',body}){
 const res=await request(BASE+path,{method,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
 if(!res.ok)throw Error('Canva export API unavailable ('+res.status+'); check connected Canva account and export permission');
 return await res.json();
}
export async function woodlandStart({uploads,token,request=fetch,clock=()=>Date.now()}){
 const existing=await uploads.get(KEY,{type:'json',consistency:'strong'});
 if(existing?.phase==='ready'||existing?.phase==='exporting'||existing?.phase==='in_progress'||existing?.phase==='finalizing')return {phase:existing.phase};
 if(existing)throw Error('Previous export requires review; do not silently retry');
 const reserved=await uploads.setJSON(KEY,{phase:'exporting',designId:WOODLAND_DESIGN,startedAt:clock()},{onlyIfNew:true});
 if(!reserved.modified)throw Error('Export already started');
 try{
  const design=(await api({token,request,path:'/designs/'+WOODLAND_DESIGN})).design;
  if(design?.id!==WOODLAND_DESIGN)throw Error('Original woodland Canva design not accessible');
  const pageList=await api({token,request,path:'/designs/'+WOODLAND_DESIGN+'/pages?limit=4'});
  if(pageList?.items?.length!==3||pageList.items.some(p=>p.dimensions?.width!==3394||p.dimensions?.height!==4800))throw Error('Original three-page canvas changed');
  const jobs=[];
  for(let n=1;n<=3;n++){
   const j=(await api({token,request,path:'/exports',method:'POST',body:{design_id:WOODLAND_DESIGN,format:{type:'png',lossless:true,width:3394,pages:[n]}}})).job;
   if(typeof j?.id!=='string'||!j.id)throw Error('Canva did not accept page '+n+' export');
   jobs.push({page:n,id:j.id});
  }
  await uploads.setJSON(KEY,{phase:'in_progress',designId:WOODLAND_DESIGN,startedAt:clock(),jobs});
  return {phase:'in_progress',pages:3};
 }catch(e){
  await uploads.setJSON(KEY,{phase:'needs_review',reason:String(e.message).slice(0,155),at:clock()});
  throw e;
 }
}
export async function woodlandFinish({uploads,token,request=fetch,clock=()=>Date.now()}){
 const state=await uploads.get(KEY,{type:'json',consistency:'strong'});
 if(state?.phase==='ready')return {phase:'ready',pages:3};
 if(state?.phase!=='in_progress'||!Array.isArray(state.jobs)||state.jobs.length!==3)throw Error('No active three-page woodland Canva export');
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
  const saved=[];
  for(let i=0;i<3;i++){
   const result=await request(jobs[i].url,{redirect:'error',signal:AbortSignal.timeout(45000)});
   if(!result.ok)throw Error('Canva PNG download was unavailable');
   const buf=Buffer.from(await result.arrayBuffer());
   if(buf.length>40_000_000)throw Error('Canva artwork exceeds single-page safety limit');
   const info=inspectPNG(buf);
   if(info.width!==3394||info.height!==4800)throw Error('Canva page did not export at approved A-series resolution');
   const key=fileKey(WOODLAND[i]);await uploads.set(key,buf);
   const readBack=await uploads.get(key,{type:'arrayBuffer',consistency:'strong'});
   if(inspectPNG(Buffer.from(readBack)).sha256!==info.sha256)throw Error('Canva artwork did not persist');
   saved.push({slug:WOODLAND[i].slug,bytes:buf.length,sha256:info.sha256,width:info.width,height:info.height});
  }
  await uploads.setJSON(KEY,{phase:'ready',designId:WOODLAND_DESIGN,createdAt:clock(),pages:saved});
  return {phase:'ready',pages:3};
 }catch(e){
  await uploads.setJSON(KEY,{phase:'needs_review',reason:'Canva export not fully verified: '+String(e.message).slice(0,120),at:clock()});
  throw e;
 }
}
export async function woodlandStatus({uploads}){
 const state=await uploads.get(KEY,{type:'json',consistency:'strong'});
 return {phase:state?.phase||'not_started',pages:state?.phase==='ready'?3:0,...state?.phase==='needs_review'?{reason:state.reason}:{}};
}
export async function woodlandDownload({uploads}){
 const state=await uploads.get(KEY,{type:'json',consistency:'strong'});
 if(state?.phase!=='ready'||state?.pages?.length!==3)throw Error('All three original Canva PNGs must pass verification before download');
 const zip=new yazl.ZipFile();
 for(const p of WOODLAND){
  const image=Buffer.from(await uploads.get(fileKey(p),{type:'arrayBuffer',consistency:'strong'}));
  const info=inspectPNG(image),ref=state.pages.find(x=>x.slug===p.slug);
  if(info.sha256!==ref?.sha256||info.width!==3394||info.height!==4800)throw Error('Private Canva artwork failed integrity check');
  zip.addBuffer(image,p.slug+'/poster.png',{compress:false});
  zip.addBuffer(Buffer.from(details(p),'utf8'),p.slug+'/details.md');
 }
 zip.end();
 return new Response(Readable.toWeb(zip.outputStream),{
  headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="Sapiver_Prints_Missing_Woodland_Verses_A4_A5_3.zip"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
 });
}
