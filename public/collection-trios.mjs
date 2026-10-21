// Metadata contracts for the TWO separate sets of three in a six-poster ZIP.
// Pure shared browser/Node validation. Never manufacture a bundle listing from poster copy.
const fail=s=>{throw Error(s);};
const SKU=/^[A-Za-z0-9_-]{1,100}$/;
const unique=values=>new Set(values.map(x=>x.toLowerCase())).size===values.length;
const requiredDisclosure=/(?:AI[-\s]?assist|AI[-\s]?generat|artificial intelligence|generative AI)/i;
const sizeList=['A5','A4','A3'];
export function parseTrioDetails(text,{filename='bundle.md'}={}){
 if(typeof text!=='string'||text.length>15000||text.includes('\0'))fail(filename+': invalid text');
 const rows=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim().split('\n');
 const idx=rows.findIndex(s=>/^Description:[\t ]*$/i.test(s));
 if(idx<0)fail(filename+': Description: is required on its own line');
 const fields={};
 for(const line of rows.slice(0,idx)){
  if(!line.trim())continue;
  const m=/^(Title|Listing title|Section|Size|Members|Tags):[ \t]*(.+)$/i.exec(line);
  if(!m)fail(filename+': unknown bundle field');
  const key=m[1].toLowerCase();
  if(Object.hasOwn(fields,key))fail(filename+': duplicate '+key);
  fields[key]=m[2].trim();
 }
 const {title,section,sz}= {title:fields.title,section:fields.section,sz:fields.size};
 const listingTitle=fields['listing title'],size=sz;
 const tags=String(fields.tags||'').split(',').map(x=>x.trim());
 const members=String(fields.members||'').split(',').map(x=>x.trim());
 const description=rows.slice(idx+1).join('\n').trim();
 if(!title||title.length>100||/[<>\u0000-\u001f]/.test(title))fail(filename+': short descriptive trio name required');
 if(!listingTitle||listingTitle.length>140||!/(?:set|collection|trio|bundle)/i.test(listingTitle)||!/(?:print|poster|wall art)/i.test(listingTitle)||/[<>\u0000-\u001f]/.test(listingTitle))fail(filename+': Etsy title must name a physical set of three prints');
 if(!section||section.length>24||/[<>\u0000-\u001f]/.test(section))fail(filename+': valid existing Etsy section required');
 if(!sizeList.includes(size))fail(filename+': Size must be one fixed A5, A4 or A3; no mixed-size supplier order');
 if(members.length!==3||!unique(members)||members.some(x=>!x||x.length>90||x.includes('/')||x.includes('\\')||x==='.'||x==='..'||/[<>\u0000-\u001f]/.test(x)))fail(filename+': Members must identify exactly three distinct poster folder names');
 if(tags.length!==13||!unique(tags)||tags.some(x=>!x||x.length>20||/[<>\u0000-\u001f]/.test(x)))fail(filename+': exactly 13 distinct Etsy tags, maximum 20 characters each');
 if(description.length<100||description.length>9000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(description))fail(filename+': bundle description must be 100–9000 characters');
 if(!requiredDisclosure.test(description))fail(filename+': description needs an accurate AI assistance disclosure');
 if(!/\b(?:three|3)\b/i.test(description)||!/\b(?:unframed|prints only)\b/i.test(description))fail(filename+': description must state three unframed prints');
 if(!description.includes(size))fail(filename+': description must explain exact fixed '+size+' size');
 return {title,listingTitle,sectionTitle:section,size,members,tags,description};
}
export function validateTwoTrios(items,trios){
 if(!Array.isArray(items)||items.length!==6||!Array.isArray(trios)||trios.length!==2)fail('Eight-listing collection needs exactly six individual posters and two different trio manifests');
 const names=new Map();
 for(const p of items){
  const leaf=String(p.folder||'').split('/').at(-1);
  if(!leaf||names.has(leaf.toLowerCase()))fail('Six unique poster folder names required');
  names.set(leaf.toLowerCase(),p);
 }
 const assigned=new Set();
 for(let n=0;n<2;n++){
  const b=trios[n];
  if(!b?.listingTitle||b.members?.length!==3)fail('Bundle '+(n+1)+' details missing');
  for(const member of b.members){
   const p=names.get(member.toLowerCase());
   if(!p)fail('Bundle '+(n+1)+' names unknown poster folder '+member);
   const key=member.toLowerCase();
   if(assigned.has(key))fail('One poster cannot occur in both trio sets');
   assigned.add(key);
   if(!p.printSizes?.includes(b.size))fail('Bundle '+(n+1)+' requests '+b.size+' but '+member+' is not approved for that print size');
   if(p.sectionTitle!==b.sectionTitle)fail('Each trio must use the actual Etsy section of its three members');
  }
 }
 if(assigned.size!==6)fail('Each of the six posters must belong to exactly one trio');
 for(const attr of ['title','listingTitle','description']){
  if(String(trios[0][attr]).trim().toLowerCase()===String(trios[1][attr]).trim().toLowerCase())
   fail('The two trio '+attr+' values must be different, not duplicated copy');
 }
 if(trios[0].tags.join('|').toLowerCase()===trios[1].tags.join('|').toLowerCase())
   fail('Each trio needs its own distinct set of 13 tags');
 return trios.map((b,i)=>({...b,number:i+1,memberPosters:b.members.map(x=>names.get(x.toLowerCase()))}));
}
export function validateBundleInput({sku,title,discount,trio}){
 const cleanSku=String(sku||'').trim(),cleanTitle=String(title||'').trim();
 if(!SKU.test(cleanSku))fail('PrintShrimp bundle SKU must contain 1–100 letters, digits, dashes or underscores');
 if(!cleanTitle||cleanTitle.length>140||!/(?:print|poster|wall art)/i.test(cleanTitle))fail('Etsy bundle title must identify the printed wall art');
 if(![0,10,15].includes(Number(discount)))fail('Bundle discount must be 0%, 10% or 15%');
 if(!trio?.members||trio.members.length!==3)fail('Bundle members not verified');
 return {sku:cleanSku,title:cleanTitle,discount:Number(discount)};
}
export function makeEightListingPlan({items,trios,inputs}){
 const bundles=validateTwoTrios(items,trios);
 if(!Array.isArray(inputs)||inputs.length!==2)fail('Both bundle SKUs and titles are required');
 const settings=inputs.map((x,i)=>validateBundleInput({...x,trio:bundles[i]}));
 if(settings[0].sku.toLowerCase()===settings[1].sku.toLowerCase())fail('Two PrintShrimp bundles require different SKUs');
 return {version:1,totalListings:8,individualListings:items.length,bundleListings:bundles.map((b,i)=>({
  number:b.number,memberFolders:b.members,memberTitles:b.memberPosters.map(p=>p.listingTitle),
  size:b.size,sectionTitle:b.sectionTitle,tags:[...b.tags],description:b.description,
  sku:settings[i].sku,listingTitle:settings[i].title,discount:settings[i].discount
 }))};
}
