import {socialCopy,createSocialVideo} from './social-video.mjs';

// Delegated listener works for bulk-review cards rendered after status polling.
let active=false,previousUrl=null;
const element=(tag,value)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=value;return el;};
function copyField(container,title,value){
 const label=element('label',title),area=element('textarea'),button=element('button','Copy '+title);
 area.value=value;area.readOnly=true;area.rows=Math.max(2,Math.min(7,value.split('\n').length+1));
 area.style.width='100%';area.style.boxSizing='border-box';
 button.type='button';button.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(value);button.textContent='Copied '+title;}
  catch{area.focus();area.select();button.textContent='Select and copy the highlighted text';}
 });
 label.append(area);container.append(label,button);
}
function showCopy(container,copy){
 if(!container)return;
 container.replaceChildren();
 container.append(element('h4','Your ready-to-post TikTok / YouTube copy'));
 copyField(container,'TikTok description and hashtags',copy.tiktok);
 copyField(container,'YouTube Shorts title',copy.youtubeTitle);
 copyField(container,'YouTube Shorts description and hashtags',copy.youtube);
 container.append(element('p','Check the Etsy listing is live before posting. Nothing will be posted automatically.'));
}
document.addEventListener('click',async event=>{
 const button=event.target?.closest?.('[data-social-groups]');
 if(!button||active||button.disabled)return;
 const section=button.closest('section');
 const status=section?.querySelector('[data-social-status]');
 const output=section?.querySelector('[data-social-results]');
 let groups;
 try{groups=JSON.parse(button.dataset.socialGroups||'[]');
  showCopy(output,socialCopy(groups));}
 catch{if(status)status.textContent='Saved product data could not be read. Refresh the page.';return;}
 active=true;button.disabled=true;
 const initial=button.textContent;
 try{
  if(status)status.textContent='Preparing your 12-second vertical video…';
  const result=await createSocialVideo(groups,{onProgress:message=>{
   if(status)status.textContent=message;
  }});
  if(previousUrl)URL.revokeObjectURL(previousUrl);
  previousUrl=URL.createObjectURL(result.video);
  const link=element('a','Download '+result.filename);
  link.href=previousUrl;link.download=result.filename;link.style.display='inline-block';
  const player=element('video');player.controls=true;player.playsInline=true;
  player.preload='metadata';player.src=previousUrl;
  player.style.width='min(100%,320px)';player.style.maxHeight='440px';
  if(output)output.prepend(link,player);
  // The user may still tap the visible link if Android suppresses an async download.
  const a=element('a');a.href=previousUrl;a.download=result.filename;a.hidden=true;
  document.body.append(a);a.click();a.remove();
  if(status)status.textContent='Video created ('+result.format.toUpperCase()+
   ', 1080 × 1920, 12 seconds). Saved video and copy are ready for review. No social post was published.';
 }catch(error){
  if(status)status.textContent='Video creation stopped: '+(error?.message||'unknown error')+
   ' Your original mock-ups and saved listings are unchanged.';
 }finally{active=false;button.disabled=false;button.textContent=initial;}
});
window.addEventListener('pagehide',()=>{if(previousUrl)URL.revokeObjectURL(previousUrl);});
