const auditButton=document.getElementById('seo-audit');
const applyButton=document.getElementById('seo-apply');
const confirmBox=document.getElementById('seo-confirm');
const status=document.getElementById('seo-status');
const results=document.getElementById('seo-results');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content||'';
let audit=null;
const message=s=>{status.textContent=s;};
const send=async(path,body)=>{
 const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-poster-csrf':csrf},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Etsy request failed');return data;
};
const line=(tag,body)=>{const e=document.createElement(tag);e.textContent=body;return e;};
function render(rows){
 results.replaceChildren();
 results.append(line('p','Seller read-back complete: '+rows.length+' listings. Each current tag set is shown for comparison; do not assume proposed phrases have proven search traffic.'));
 for(const row of rows){
  const article=document.createElement('article');
  article.append(line('h3',row.title),line('p','Listing '+row.id+' · '+row.state));
  const link=document.createElement('a');link.href='https://www.etsy.com/listing/'+row.id;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Inspect actual Etsy artwork';article.append(link);
  article.append(line('p','Current title: '+row.before.title),line('p','Proposed title: '+row.title),line('p','Current tags ('+row.before.tags.length+'): '+row.before.tags.join(', ')),line('p','Proposed tags ('+row.tags.length+'): '+row.tags.join(', ')));
  if(row.note)article.append(line('p','Artwork check: '+row.note));
  if(row.state!=='ready')article.append(line('p','BLOCKED: public catalogue title has changed; no update permitted.'));
  results.append(article);
 }
 applyButton.disabled=rows.length===0||rows.some(r=>r.state!=='ready');
}
auditButton.addEventListener('click',async()=>{
 applyButton.disabled=true;audit=null;results.replaceChildren();
 auditButton.disabled=true;message('Reading all current Etsy listings; no changes will be made...');
 try{
  audit=await send('/poster/seo/prepare',{});
  render(audit.rows);message('All '+audit.rows.length+' listings inspected via seller API. Review before applying changes.');
 }catch(error){message('Audit failed: '+error.message);}
 finally{auditButton.disabled=false;}
});
applyButton.addEventListener('click',async()=>{
 if(!audit||audit.rows.some(row=>row.state!=='ready')||!confirmBox.checked)return message('Review every listing and tick the artwork verification checkbox first.');
 if(!confirm('Apply the exact reviewed title and 13 tags to all '+audit.rows.length+' Etsy listings? The original values are backed up. Prices, inventory, images and SKUs will not be changed.'))return;
 applyButton.disabled=true;auditButton.disabled=true;let completed=0;
 try{
  for(const row of audit.rows){
   message('Updating listing '+(completed+1)+' of '+audit.rows.length+' (ID '+row.id+')...');
   const response=await send('/poster/seo/apply',{batch:audit.batch,id:row.id});
   completed++;results.querySelectorAll('article')[completed-1]?.append(line('p','Etsy result: '+response.state));
  }
  message('Etsy metadata updates completed and read back for '+completed+' of '+audit.rows.length+' listings.');
 }catch(error){message('STOPPED after '+completed+' completed listing(s): '+error.message+'. Do not retry the entire batch. Inspect the affected listing and saved audit status.');}
 finally{auditButton.disabled=false;}
});
