import {SEASONS} from './catalogue-page.mjs';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>encodeURIComponent(s);
const color=state=>state==='active'?'active':state==='inactive'?'inactive':'other';
const makeLink=(section,season)=>'/poster/catalogue'+(section||season?'?'+new URLSearchParams({...section?{section}:{},...season?{season}:{}}):'');
const validImg=x=>typeof x==='string'&&/^https:\/\/i\.etsystatic\.com\/[A-Za-z0-9_./%-]+(?:\?[A-Za-z0-9_=&%-]+)?$/.test(x);
export function folderCatalogue({audit,status,labels={},section='',season='',clock=()=>Date.now()}){
 const available=status?.phase==='available'&&audit?.version===1&&Array.isArray(audit.listings);
 const rows=available?audit.listings:[];
 const fresh=available&&Number.isFinite(audit.checkedAt)&&clock()-audit.checkedAt<=3600000&&audit.checkedAt<=clock()+30000;
 const sections=available?[...new Set([...audit.sections?.map(x=>x.title).filter(Boolean)||[],...rows.map(x=>x.section||'Uncategorised')])].sort((a,b)=>a.localeCompare(b,'en')):[];
 const validSection=section&&sections.includes(section);
 const validSeason=season&&SEASONS.includes(season);
 const subset=validSection?rows.filter(x=>x.section===section):validSeason?rows.filter(x=>(labels[x.id]||[]).includes(season)):rows;
 const active=rows.filter(x=>x.state==='active').length;
 const inactive=rows.filter(x=>x.state==='inactive').length;
 const title=validSection?section:validSeason?season:'Your catalogue';
 const intro='<div class="catalogue-toolbar"><a href="/poster/home">Dashboard</a>'+(validSection||validSeason?' <span aria-hidden="true">/</span> <a href="/poster/catalogue">Folders</a>':'')+' <span aria-hidden="true">/</span> <strong>'+e(title)+'</strong></div>';
 const statusText=!available?'No complete Etsy catalogue yet. Select Refresh to load listings and their real status.':fresh?'Etsy audit saved. Changes require separate confirmation.':"Etsy data is over one hour old. Refresh before using visibility switches.";
 const refresh='<div class="manager-actions"><button type="button" id="manager-refresh">Refresh Etsy</button><a class="soft-link" href="/poster/catalogue/audit">Advanced audit</a><p id="visibility-message" role="status">'+e(statusText)+'</p></div>';
 const folders=sections.map(name=>{
  const group=rows.filter(x=>x.section===name),on=group.filter(x=>x.state==='active').length;
  return '<a class="folder-card" href="'+e(makeLink(name,''))+'"><span class="folder-icon" aria-hidden="true">▣</span><span class="folder-name">'+e(name)+'</span><span class="folder-detail">'+group.length+' posters · '+on+' listed</span><span class="folder-arrow" aria-hidden="true">›</span></a>';
 }).join('');
 const seasons=SEASONS.filter(x=>rows.some(r=>(labels[r.id]||[]).includes(x))).map(s=>'<a class="folder-card" href="'+e(makeLink('',s))+'"><span class="folder-icon" aria-hidden="true">◷</span><span class="folder-name">'+e(s)+'</span><span class="folder-detail">'+rows.filter(r=>(labels[r.id]||[]).includes(s)).length+' posters</span><span class="folder-arrow" aria-hidden="true">›</span></a>').join('');
 const folderView='<div class="catalogue-overview"><div class="stat-strip"><span><b>'+rows.length+'</b> posters</span><span><b>'+active+'</b> listed</span><span><b>'+inactive+'</b> off</span></div><h2>Etsy shop folders</h2><div class="folder-grid">'+folders+'</div>'+(seasons?'<h2>Seasonal groups</h2><div class="folder-grid">'+seasons+'</div>':'')+'<p class="manager-help">Organise seasonal labels under <a href="/poster/catalogue/audit">Advanced audit</a>. Folders are your existing Etsy shop sections; they are not extra Etsy listings.</p></div>';
 const allowed=rows.filter(r=>r.state==='active'||r.state==='inactive');
 const cards=subset.map(row=>{
  const selectable=row.state==='active'||row.state==='inactive',canChange=selectable&&fresh;
  const image=validImg(row.image)?'<img src="'+e(row.image)+'" loading="lazy" alt="Preview of '+e(row.title)+'">':'<span class="catalogue-placeholder" aria-label="No image available">▧</span>';
  const stateLabel=row.state==='active'?'On Etsy':row.state==='inactive'?'Off Etsy':row.state.replaceAll('_',' ');
  return '<article class="poster-card" data-listing="'+e(row.id)+'" data-title="'+e(String(row.title||'Untitled poster').toLowerCase())+'" data-state="'+e(row.state)+'"><div class="poster-thumb">'+image+'</div><div class="poster-copy"><strong class="poster-title">'+e(row.title)+'</strong><small class="poster-sub">#'+e(row.id)+' · '+e(row.section||'Uncategorised')+'</small><span class="listing-state state-'+color(row.state)+'">'+e(stateLabel)+'</span><a class="poster-etsy" href="https://www.etsy.com/listing/'+e(row.id)+'" target="_blank" rel="noopener noreferrer">Open on Etsy</a></div><div class="poster-controls">'+(selectable?'<label class="batch-choice"><input type="checkbox" class="poster-choose" data-id="'+e(row.id)+'" '+(canChange?'':'disabled')+' aria-label="Select '+e(row.title)+' for batch change"></label><label class="visibility-switch"><input type="checkbox" role="switch" class="poster-toggle" data-id="'+e(row.id)+'" data-state="'+e(row.state)+'" '+(row.state==='active'?'checked ':'')+(canChange?'':'disabled ')+'aria-label="List '+e(row.title)+' on Etsy"><span class="switch-track"></span><span class="switch-word">'+(row.state==='active'?'ON':'OFF')+'</span></label>':'<span class="restricted-state" title="Only active or inactive listings can be switched">View only</span>')+'</div></article>';
 }).join('');
 const details='<div class="manager-products"><div class="stat-strip"><span><b>'+subset.length+'</b> posters</span><span><b>'+subset.filter(x=>x.state==='active').length+'</b> listed</span><span><b>'+subset.filter(x=>x.state==='inactive').length+'</b> off</span></div><div class="manager-filter"><label>Find a poster<input id="poster-filter" type="search" placeholder="Search this folder" autocomplete="off"></label></div><div class="batch-bar"><label><input id="select-visible" type="checkbox" '+(fresh?'':'disabled')+'> Select eligible</label><button id="batch-on" type="button" '+(fresh?'':'disabled')+'>Switch selected ON</button><button id="batch-off" type="button" '+(fresh?'':'disabled')+'>Switch selected OFF</button></div><div class="poster-grid">'+(cards||'<p>No posters in this folder yet.</p>')+'</div><p class="manager-help">Switches change only visibility of existing active/inactive physical Etsy listings. Drafts, sold-out and expired listings cannot be switched here. Changes may incur Etsy fees when reactivating. Existing customer orders and PrintShrimp products are not changed.</p></div>';
 return '<section class="catalogue-manager" data-fresh="'+(fresh?'true':'false')+'">'+intro+refresh+(validSection||validSeason?details:folderView)+'<script type="module" src="/catalogue-manager.mjs"></script></section>';
}
export function studioHome({catalogue,monthly}={}){
 const total=catalogue?.summary?.physicalTotal;
 return '<section class="studio-home"><h2>Your workspace</h2><p class="home-subtitle">Choose what you need — no long administration pages.</p><div class="home-grid"><a href="/poster/catalogue"><strong>▣ Catalogue</strong><span>Folders, posters and listing switches'+(Number.isSafeInteger(total)?' · '+total+' prints':'')+'</span></a><a href="/poster/upload"><strong>＋ Single poster</strong><span>Create or update one listing</span></a><a href="/poster/bulk"><strong>▤ Six-poster pack</strong><span>Prepare a collection ZIP</span></a><a href="/poster/products"><strong>◷ Upload history</strong><span>Saved product progress and corrections</span></a></div>'+(monthly?'<p class="home-quota">'+monthly.used+' of '+monthly.limit+' new listing slots used this month.</p>':'')+'<details><summary>Advanced tools</summary><p><a href="/poster/catalogue/audit">Etsy / PrintShrimp delivery audit and seasonal labels</a> · <a href="/poster/seo">Etsy listing SEO review</a></p></details></section>';
}
