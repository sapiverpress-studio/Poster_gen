import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function makeListingVideo(images){
 if(images.length!==4||images.some(b=>!Buffer.isBuffer(b)||!b.length))throw Error('Four room scenes required');
 const dir=await mkdtemp(join(tmpdir(),'sapiver-video-'));
 try {
  const args=['-y','-hide_banner','-loglevel','error','-filter_complex_threads','1'];
  for(let i=0;i<4;i++){const path=join(dir,i+'.jpg');await writeFile(path,images[i]);args.push('-loop','1','-t','3','-i',path);}
  const filters=images.map((_,i)=>`[${i}:v]scale=1440:1080:force_original_aspect_ratio=decrease,pad=1440:1080:(ow-iw)/2:(oh-ih)/2:color=0xf4f1eb,setsar=1,format=yuv420p,fps=30,settb=AVTB[v${i}]`);
  filters.push('[v0][v1][v2][v3]concat=n=4:v=1:a=0[out]');
  const path=join(dir,'listing.mp4');args.push('-filter_complex',filters.join(';'),'-map','[out]','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-profile:v','baseline','-level:v','4.0','-bf','0','-g','30','-tag:v','avc1','-movflags','+faststart','-threads','2',path);
  await exec('ffmpeg',args,{timeout:120000,maxBuffer:2_000_000});
  const video=await readFile(path);if(video.length>100_000_000)throw Error('Listing video too large');
  const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{timeout:15000})).stdout);
  const stream=probe.streams.find(s=>s.codec_type==='video');if(probe.streams.some(s=>s.codec_type==='audio')||stream?.width!==1440||stream?.height!==1080||Number(probe.format.duration)<5||Number(probe.format.duration)>15)throw Error('Video validation failed');
  return video;
 }finally{await rm(dir,{recursive:true,force:true});}
}

export async function inspectVideoPlayback(bytes){
 const dir=await mkdtemp(join(tmpdir(),'sapiver-playback-'));
 try{const path=join(dir,'video.mp4');await writeFile(path,bytes);const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{timeout:20000})).stdout);const decoded=await exec('ffmpeg',['-hide_banner','-v','error','-i',path,'-f','null','-'],{timeout:60000,maxBuffer:1_000_000});if(decoded.stderr.trim())throw Error('Video decode errors');const v=probe.streams.find(s=>s.codec_type==='video');if(!v||v.codec_name!=='h264'||v.pix_fmt!=='yuv420p'||!Number.isFinite(Number(probe.format.duration)))throw Error('Unsupported processed video');return {codec:v.codec_name,profile:v.profile,pixelFormat:v.pix_fmt,width:v.width,height:v.height,duration:Number(probe.format.duration),decoded:true};}
 finally{await rm(dir,{recursive:true,force:true});}
}
