// Mobile-friendly seller review; proposals persist in private server storage.
const root=document.getElementById('etsy-current-seo'),output=document.getElementById('current-seo-results'),
 note=document.getElementById('current-seo-state'),csrf=root?.dataset.csrf||'';
const refresh=document.getElementById('current-seo-refresh'),all=document.getElementById('current-seo-all'),
 stop=document.getElementById('current-seo-stop'),check=document.getElementById('current-seo-check');
let running=false,working=false,rows=[],lastPhase='not_started',pendingWrite=false;
const label=(tag,value)=>{const el=document.createElement(tag);el.textContent=String(value);return el};
function alertText(v){note.textContent=v}
async function api(path,body){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),body?56000:18000);
 try{
  const res=await fetch('/poster/seo/current'+path,{method:body?'POST':'GET',
   credentials:'same-origin',cache:'no-store',
   headers:body?{'Content-Type':'application/json','X-Poster-CSRF':csrf}:{},
   ...(body?{body:JSON.stringify(body)}:{}),signal:ctrl.signal});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||'Etsy review unavailable');
  return data;
 }finally{clearTimeout(timer);}
}
function labelField(container,title,value,kind='input'){
 const wrap=document.createElement('label'),el=document.createElement(kind);
 wrap.append(label('strong',title));wrap.style.display='block';wrap.style.margin='8px 0';
 el.style.width='100%';el.value=value||'';
 if(kind==='textarea')el.rows=title.includes('Tags')?3:4;
 wrap.append(el);container.append(wrap);return el;
}
function render(data){
 rows=data.rows||[];lastPhase=data.phase||'not_started';pendingWrite=rows.some(x=>['apply_queued','sending'].includes(x.status));output.replaceChildren();
 const counts={};for(const x of rows)counts[x.status]=(counts[x.status]||0)+1;
 alertText('Seller catalogue: '+rows.length+' active listings · '+(counts.proposed||0)+' reviewed proposals · '+(counts.updated||0)+' verified updates · '+(counts.pending||0)+' awaiting image analysis'+(data.phase==='queued'?' · Etsy audit running':''));
 if(data.phase==='queued'){output.append(label('p','Authenticated Etsy catalogue audit is running. Refresh status to check progress.'));return;}
 if(!rows.length){output.append(label('p','Press Read current Etsy listings to start a read-only audit.'));return;}
 const ready=rows.filter(r=>r.status==='proposed').length;
 output.append(label('p','Each proposal can be edited before applying. Saving a proposal does not change Etsy. Updating requires a separate confirmation for that specific listing.'));
 for(const row of rows){
  const section=document.createElement('details');section.style.margin='12px 0';section.style.padding='12px';section.style.border='1px solid #ccc';section.style.borderRadius='12px';
  if(row.status==='proposed'||row.status==='needs_investigation')section.open=true;
  const summary=document.createElement('summary');
  summary.textContent=(row.type==='download'?'Digital':'Print')+' · '+row.title+' — '+row.status.replaceAll('_',' ');
  section.append(summary);
  const header=document.createElement('div');header.style.display='flex';header.style.alignItems='flex-start';header.style.gap='10px';header.style.margin='10px 0';
  if(row.imageUrl){const img=document.createElement('img');img.src=row.imageUrl;img.alt='Existing Etsy listing artwork';img.width=86;img.style.maxHeight='120px';img.style.objectFit='contain';header.append(img);}
  const basics=document.createElement('div');basics.append(label('p','Etsy #'+row.id+' · '+row.type+(row.trio?' · three-print set':'')));
  const link=document.createElement('a');link.href='https://www.etsy.com/listing/'+row.id;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View live Etsy listing';basics.append(link);
  header.append(basics);section.append(header);
  if(row.status==='pending'||row.status==='analysis_failed'){
   const button=label('button',row.status==='analysis_failed'?'Retry image analysis':'Analyse this listing');button.type='button';
   button.addEventListener('click',async()=>{if(working)return;working=true;button.disabled=true;try{alertText('Analysing Etsy #'+row.id+'…');await api('/analyse',{id:row.id});await load();}
    catch(e){alertText(e.message);}finally{working=false;button.disabled=false;}});
   section.append(button);
  }
  if(row.status==='proposed'&&row.proposal){
   section.append(label('p','Current title: '+row.title));
   const title=labelField(section,'Proposed Etsy title',row.proposal.title);
   section.append(label('p','Current tags: '+(row.tags||[]).join(', ')));
   const tags=labelField(section,'13 proposed Etsy tags, comma-separated',row.proposal.tags.join(', '),'textarea');
   const intro=labelField(section,'Optional new introduction',row.proposal.intro,'textarea');
   section.append(label('p','Your current description is retained. The optional introduction is only added if you tick the box below.'));
   const choose=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=false;
   choose.append(checkbox,document.createTextNode(' Add new introduction above existing description'));section.append(choose);
   const actions=document.createElement('div');actions.style.display='flex';actions.style.flexWrap='wrap';actions.style.gap='8px';
   const save=label('button','Save edited proposal'),apply=label('button','Approve and update this Etsy listing');
   save.type=apply.type='button';
   const saveReview=async()=>{
    const tagList=tags.value.split(',').map(s=>s.trim()).filter(Boolean);
    return api('/edit',{id:row.id,title:title.value,tags:tagList,intro:intro.value});
   };
   save.addEventListener('click',async()=>{if(working||running)return;working=true;save.disabled=true;
    try{await saveReview();alertText('Saved review for Etsy '+row.id+'. No Etsy listing changed.');await load();}
    catch(e){alertText(e.message);}finally{working=false;save.disabled=false;}
   });
   apply.addEventListener('click',async()=>{if(working||running)return;
    if(!confirm('Update ONLY Etsy listing #'+row.id+' with this title and 13 tags'+(checkbox.checked?', plus the optional description introduction':'')+'? Existing files, photos, prices, variations and fulfilment remain unchanged.'))return;
    working=true;apply.disabled=true;
    try{
     const reviewed=await saveReview();
     const result=await api('/apply',{id:row.id,proposalHash:reviewed.proposalHash,includeIntro:checkbox.checked,confirm:true});
     alertText('Etsy '+row.id+' update queued for seller verification. No success claimed until read-back.');
     await load();
    }catch(e){alertText(e.message);}finally{working=false;apply.disabled=false;}
   });
   actions.append(save,apply);section.append(actions);
  }
  if(row.status==='updated')section.append(label('p','Updated and read back from Etsy. The product and fulfilment fields were checked.'));
  if(row.reason)section.append(label('p','Review needed: '+row.reason));
  output.append(section);
 }
}
async function load(){const data=await api('/status');render(data);return data;}
refresh?.addEventListener('click',async()=>{if(working||running)return;
 if(rows.some(x=>['proposed','updated'].includes(x.status))&&!confirm('Replace the current saved SEO review with a fresh Etsy catalogue audit? Existing verified Etsy changes remain on Etsy.'))return;
 working=true;refresh.disabled=true;
 try{await api('/prepare',{confirm:true});alertText('Authenticated Etsy catalogue read queued. No listings changed.');await load();}
 catch(e){alertText(e.message);}finally{working=false;refresh.disabled=false;}});
check?.addEventListener('click',()=>load().catch(e=>alertText(e.message)));
 // Poll only while this owner page is open; never schedule a remote/background task.
 setInterval(()=>{if(!working&&!running&&(lastPhase==='queued'||pendingWrite))load().catch(()=>{});},6000);
all?.addEventListener('click',async()=>{if(running||working)return;running=true;
 alertText('Analysing existing listings one at a time. You may stop; completed proposals are saved.');
 try{const data=await load(),pending=(data.rows||[]).filter(x=>['pending','analysis_failed'].includes(x.status)&&x.imageUrl);
  let done=0,errors=0;
  for(const row of pending){
   if(!running)break;
   try{await api('/analyse',{id:row.id});done++;}
   catch{errors++;}
   alertText('Image analysis progress: '+(done+errors)+'/'+pending.length+' · '+done+' completed · '+errors+' need review. Nothing changed on Etsy.');
  }
  await load();
  alertText('Image analysis finished: '+done+' proposals saved'+(errors?' · '+errors+' listings require manual review':'')+'. Approve changes individually after reading.');
 }catch(e){alertText(e.message);}finally{running=false;}
});
stop?.addEventListener('click',()=>{running=false;alertText('Stopping after the current listing. Completed proposals remain saved.');});
load().catch(e=>alertText(e.message));
