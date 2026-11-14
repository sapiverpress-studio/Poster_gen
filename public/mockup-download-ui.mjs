import './social-video-ui.mjs';
import {collectMockups} from './mockup-download.mjs';

// One delegated listener also handles cards added by the bulk status poll.
let active=false;
document.addEventListener('click',async event=>{
 const button=event.target?.closest?.('[data-mockups-groups]');
 if(!button||active||button.disabled)return;
 const status=button.parentElement?.querySelector?.('[data-mockups-status]');
 let groups;
 try{groups=JSON.parse(button.dataset.mockupsGroups||'[]');}
 catch{if(status)status.textContent='The saved mock-up list needs refreshing.';return;}
 active=true;button.disabled=true;
 const original=button.textContent;
 try{
  if(status)status.textContent='Checking saved mock-ups…';
  const {blob,filename,count}=await collectMockups(groups,{
   onProgress:(done,total)=>{if(status)status.textContent='Downloading mock-up '+done+' of '+total+'…';}
  });
  const href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=filename;a.hidden=true;
  document.body.appendChild(a);
  try{a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);}
  if(status)status.textContent='ZIP prepared: '+count+' original JPG mock-ups. Check your Downloads folder.';
 }catch(error){
  if(status)status.textContent='Download stopped: '+(error?.message||'Could not collect all mock-ups')+
   ' Your saved Etsy listings and print files are unchanged.';
 }finally{active=false;button.disabled=false;button.textContent=original;}
});
