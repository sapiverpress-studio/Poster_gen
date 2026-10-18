const csrf=document.querySelector('meta[name="poster-csrf"]')?.content||'';
async function firstOn(id,status){
 if(!/^[A-Za-z0-9_-]{32}$/.test(id))return;
 if(!confirm('Prepare this stored poster for its FIRST Etsy listing?\n\nThis reserves one of your 52 monthly listing slots only if available. You will review the finished Etsy listing, artwork and PrintShrimp details before approving publication. No listing is created by this click.'))return;
 status.textContent='Checking monthly allowance and preparing your saved poster…';
 try{
  const r=await fetch('/poster/stored/'+id+'/prepare',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'x-poster-csrf':csrf}});
  const data=await r.json();
  if(!r.ok){if(data.reason==='monthly_limit'){status.textContent='All 52 monthly slots are used. Poster remains safely stored. Try next month.';return;}throw Error(data.error||'Could not start first-listing review');}
  if(data.phase!=='preparing')throw Error('Saved poster status needs checking');
  location.assign('/poster/upload?id='+id);
 }catch(error){status.textContent='Poster remains stored or needs checking: '+error.message+'. Do not press ON again before checking the saved status.';}
}
document.getElementById('prepare-stored')?.addEventListener('click',e=>firstOn(e.currentTarget.dataset.id,document.getElementById('stored-status')));
document.querySelectorAll('.stored-first-on').forEach(button=>button.addEventListener('click',()=>{
 const msg=document.getElementById('visibility-message');
 firstOn(button.dataset.id,msg);
}));
