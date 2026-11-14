import {validateMockupGroups} from './mockup-download.mjs';

// Owner-side video export. No remote AI/video service or merchant mutation.
// Browser prefers MP4/H.264; a WebM fallback is also accepted by TikTok and YouTube.
const SHOP='https://www.etsy.com/shop/SapiverPrints';
const W=1080,H=1920,DURATION_MS=12000,FPS=24,MAX_JPEG=12_000_000,MAX_VIDEO=90_000_000;
const TAGS=[
 ['hedgehog','#HedgehogArt'],['giraffe','#GiraffeArt'],['snail','#SnailArt'],
 ['sloth','#SlothArt'],['snake','#SnakeArt'],['zebra','#ZebraArt'],
 ['flower','#FloralWallArt'],['rose','#FloralWallArt'],['botanical','#BotanicalArt'],
 ['nature','#NaturePrints'],['music','#MusicWallArt'],['nursery','#NurseryWallArt'],
 ['children','#KidsRoomDecor'],['kids','#KidsRoomDecor']
];
const clean=s=>String(s||'Poster').replace(/\s+/g,' ').trim().slice(0,90);
const filePart=s=>clean(s).normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,52)||'Poster';
const groupsForSocial=groups=>validateMockupGroups(groups).map((g,i)=>({...g,name:clean(groups[i]?.name)}));

export function socialCopy(groups){
 const a=groupsForSocial(groups),multiple=a.length>1,one=a[0];
 const subject=multiple?'Sapiver Prints artwork collection':one.name;
 const tag=TAGS.find(([key])=>a.some(g=>g.name.toLowerCase().includes(key)))?.[1]||
  (a.some(g=>g.type==='trio')?'#GalleryWall':'#WallArt');
 const hashtags=[tag,'#SapiverPrints','#ArtPrints',multiple?'#ArtCollection':'#WallArt','#HomeDecor'];
 const unique=[...new Set(hashtags)];
 const hook=multiple?'Which print would you choose?':one.type==='trio'?
  'Three prints. One matching set.':'Which frame would you choose?';
 const lead=multiple?'A closer look at our '+a.length+'-listing collection.':
  one.type==='trio'?'Explore this matching three-print set: '+subject+'.':
  'A closer look at '+subject+' in four different presentations.';
 const link='Explore Sapiver Prints on Etsy: '+SHOP;
 const tiktok=hook+'\n'+lead+'\n'+link+'\n\n'+unique.join(' ');
 const youtubeTitle=(multiple?'Sapiver Prints Collection':subject+' | Wall Art')+' #Shorts';
 const youtube=lead+'\n'+hook+'\n'+link+
  '\n\n'+[...new Set([...unique,'#Shorts'])].join(' ');
 return {subject,hook,tiktok,youtubeTitle:youtubeTitle.slice(0,100),
  youtube,hashtags:unique.join(' '),filename:'Sapiver_'+filePart(subject)+'_Social_Video'};
}
export function socialShots(groups){
 const a=groupsForSocial(groups);
 // For a collection select one representative image per saved listing, not all 32 JPEGs.
 // This keeps Android peak memory practical and still includes every listing.
 return a.length===1?[0,1,2,3].map(index=>({...a[0],index})):
  a.map(g=>({...g,index:g.type==='trio'?0:1}));
}
export function preferredVideoType(supports){
 for(const type of ['video/mp4;codecs=avc1.42E01E','video/mp4',
  'video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm']){
  if(supports(type))return type;
 }
 return null;
}
function wrapped(ctx,str,maxWidth,maxLines=3){
 const words=String(str).split(/\s+/),lines=[],limit=maxWidth;
 let current='';
 for(const word of words){
  const trial=current?current+' '+word:word;
  if(ctx.measureText(trial).width>limit&&current){lines.push(current);current=word;}
  else current=trial;
 }
 if(current)lines.push(current);
 return lines.slice(0,maxLines);
}
function draw(ctx,shots,images,copy,elapsed){
 const slide=Math.min(shots.length-1,Math.floor(elapsed/DURATION_MS*shots.length));
 const local=((elapsed/DURATION_MS*shots.length)%1),img=images[slide];
 ctx.fillStyle='#f2eee8';ctx.fillRect(0,0,W,H);
 const shade=ctx.createLinearGradient(0,0,W,H);
 shade.addColorStop(0,'#faf8f4');shade.addColorStop(1,'#e8e1d7');
 ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#1d2425';ctx.fillRect(0,0,W,26);
 ctx.fillStyle='#202627';ctx.font='bold 37px system-ui,Arial,sans-serif';
 ctx.textAlign='center';ctx.fillText('SAPIVER PRINTS',W/2,120);
 ctx.fillStyle='#7b6f61';ctx.font='600 28px system-ui,Arial,sans-serif';
 ctx.fillText('ART FOR YOUR WALLS',W/2,171);
 ctx.fillStyle='#1c2224';ctx.font='bold 50px system-ui,Arial,sans-serif';
 for(const [i,line] of wrapped(ctx,copy.hook,960,2).entries())ctx.fillText(line,W/2,245+i*63);
 const x=65,y=365,boxW=950,boxH=1180;
 ctx.fillStyle='#fff';ctx.shadowColor='rgba(25,25,25,.17)';ctx.shadowBlur=28;
 ctx.shadowOffsetY=15;ctx.fillRect(x,y,boxW,boxH);
 ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 const scale=Math.min((boxW-55)/img.width,(boxH-55)/img.height)*(1+.025*local);
 const dw=img.width*scale,dh=img.height*scale;
 ctx.save();ctx.beginPath();ctx.rect(x+18,y+18,boxW-36,boxH-36);ctx.clip();
 ctx.drawImage(img,x+(boxW-dw)/2,y+(boxH-dh)/2,dw,dh);ctx.restore();
 ctx.fillStyle='#1b2526';ctx.font='bold 43px system-ui,Arial,sans-serif';
 const lines=wrapped(ctx,shots[slide].name,970,2);
 lines.forEach((line,i)=>ctx.fillText(line,W/2,1633+i*57));
 ctx.fillStyle='#5f5b53';ctx.font='30px system-ui,Arial,sans-serif';
 ctx.fillText(shots[slide].type==='trio'?'Three-print set':
  shots.length===4&&shots.every(s=>s.id===shots[0].id)?['Print only','Black frame','White frame','Oak frame'][slide]:'Art print',W/2,1753);
 ctx.fillStyle='#202627';ctx.font='600 31px system-ui,Arial,sans-serif';
 ctx.fillText('Discover Sapiver Prints on Etsy',W/2,1840);
 ctx.fillStyle='#a49e95';
 for(let i=0;i<shots.length;i++)ctx.fillRect(W/2-shots.length*28+i*56,1878,43,8);
 ctx.fillStyle='#1d2425';ctx.fillRect(W/2-shots.length*28+slide*56,1878,43,8);
}
async function loadImage(shot,fetcher){
 const url='/poster/uploads/'+shot.id+'/mockups/'+shot.index;
 let res;
 try{res=await fetcher(url,{credentials:'same-origin',redirect:'error',cache:'no-store'});}
 catch{throw Error('Could not fetch a saved mock-up. Check your owner login and connection.');}
 if(!res?.ok||res.redirected||!/^image\/jpeg(?:;|$)/i.test(res.headers?.get?.('content-type')||''))
  throw Error('A saved JPG is unavailable. Sign in again or check the product review.');
 const size=Number(res.headers.get('content-length')||0);
 if(size>MAX_JPEG)throw Error('An image is too large for the mobile video maker.');
 const blob=await res.blob();
 if(blob.size<4||blob.size>MAX_JPEG)throw Error('A saved JPG cannot be read safely.');
 const u=URL.createObjectURL(blob),img=new Image();
 try{img.src=u;await img.decode();return img;}
 catch{throw Error('A saved JPG could not be decoded.');}
 finally{URL.revokeObjectURL(u);}
}

export async function createSocialVideo(groups,{fetcher=fetch,onProgress=()=>{}}={}){
 if(typeof document==='undefined'||typeof MediaRecorder==='undefined'||
    !HTMLCanvasElement.prototype.captureStream)
  throw Error('This browser cannot make video. Try the current Android Chrome browser.');
 const shots=socialShots(groups),copy=socialCopy(groups);
 const mime=preferredVideoType(type=>MediaRecorder.isTypeSupported(type));
 if(!mime)throw Error('This browser does not support MP4 or WebM recording.');
 const images=[];
 for(let i=0;i<shots.length;i++){
  images.push(await loadImage(shots[i],fetcher));
  onProgress('Loading saved artwork '+(i+1)+' of '+shots.length+'…');
 }
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)throw Error('Cannot create a video drawing surface on this device.');
 draw(ctx,shots,images,copy,0);
 let stream,recorder,raf,timeout;
 try{
  stream=canvas.captureStream(FPS);
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3_000_000});
  const chunks=[];
  const video=await new Promise((resolve,reject)=>{
   let settled=false,live=true;
   const fail=e=>{if(settled)return;settled=true;live=false;reject(e instanceof Error?e:Error('Video recording failed.'))};
   recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   recorder.onerror=()=>fail(Error('Browser video encoder failed. No video was saved.'));
   recorder.onstop=()=>{
    live=false;if(settled)return;settled=true;
    resolve(new Blob(chunks,{type:recorder.mimeType||mime}));
   };
   try{recorder.start(500);}catch(e){fail(e);return;}
   const start=performance.now();
   const frame=now=>{
    if(!live)return;
    const elapsed=Math.min(DURATION_MS,now-start);
    draw(ctx,shots,images,copy,elapsed);
    if(Math.floor(elapsed/1000)!==Math.floor((elapsed-1000/24)/1000))
     onProgress('Rendering video… '+Math.round(elapsed/1000)+' / 12 seconds. Keep this tab open.');
    if(elapsed<DURATION_MS)raf=requestAnimationFrame(frame);
   };
   raf=requestAnimationFrame(frame);
   timeout=setTimeout(()=>{if(live&&recorder.state!=='inactive')recorder.stop();},DURATION_MS+125);
  });
  if(video.size<2000||video.size>MAX_VIDEO)
   throw Error('Video output was incomplete or too large. Try again while keeping this tab open.');
  const type=(recorder.mimeType||mime).includes('mp4')?'mp4':'webm';
  return {video,filename:copy.filename+'.'+type,copy,format:type,
   width:W,height:H,durationSeconds:12};
 }finally{
  clearTimeout(timeout);cancelAnimationFrame(raf);
  if(recorder?.state==='recording')recorder.stop();
  stream?.getTracks()?.forEach(track=>track.stop());
 }
}
