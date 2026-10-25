// Structural Etsy search-metadata gate. This deliberately does not claim keyword demand.
// No SKU, inventory, variants, pricing, supplier mapping or listing state is changed here.
const generic=new Set(['wall art','art print','printed wall art','framed print','print','poster','prints','posters','gift','home decor']);
const filler=new Set(['a','an','the','and','for','of','with','in','on','to','wall','art','print','prints','poster','posters','framed','unframed','kids','childrens','children','educational','nursery','decor','decoration','physical','download']);
export function physicalSeoIssues({name='',title='',tags=[]}={}){
 const issues=[],heading=String(title||'').trim(),artwork=String(name||'').trim();
 const terms=heading.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
 const distinctive=[...new Set(terms.filter(word=>word.length>2&&!filler.has(word)))];
 if(!heading||heading.length>140)issues.push('Enter a descriptive Etsy title (maximum 140 characters).');
 else{
  if(!/\b(?:print|prints|poster|posters|wall art)\b/i.test(heading))issues.push('Etsy title must identify the physical print or poster.');
  if(artwork&&heading.toLowerCase()===artwork.toLowerCase())issues.push('Etsy title cannot be only the artwork name.');
  if(distinctive.length<2)issues.push('Etsy title needs the subject plus a truthful distinguishing detail, not just Wall Art Print.');
 }
 const phrases=Array.isArray(tags)?tags.map(s=>String(s).trim()):String(tags||'').split(',').map(s=>s.trim());
 if(phrases.length!==13||phrases.some(p=>!p||p.length>20||/[\x00-\x1f<>]/.test(p))||new Set(phrases.map(p=>p.toLowerCase())).size!==13)issues.push('Enter exactly 13 different Etsy tags, each at most 20 characters.');
 if(phrases.some(p=>generic.has(p.toLowerCase())))issues.push('Replace generic standalone tags such as wall art, art print and framed print with accurate buyer phrases.');
 if(phrases.filter(p=>p.split(/\s+/).length>=2).length<9)issues.push('Use at least nine descriptive multi-word Etsy tags.');
 return issues;
}
export function assertSpecificPhysicalMetadata(input){
 const issues=physicalSeoIssues(input);
 if(issues.length)throw Error('Etsy search metadata needs correction: '+issues.join(' '));
}
