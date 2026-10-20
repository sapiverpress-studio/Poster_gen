// One-time, owner-approved inventory reduction for these exact UK Etsy listings.
import {makeA4A5Inventory} from '../lib/catalogue-sizes.mjs';
export const approved=[[4595277551,"Fox Print with Original Woodland Verse"],[4595921846,"The Robin Wall Art Print"],[4595944801,"The Hedgehog Wall Art Print"],[4595765615,"Bumblebee Wall Art Print"],[4595774989,"Butterfly Wall Art Print"],[4589715100,"Animal Alphabet World Map Poster for Kids | ABC Nursery Wall Art | Educational Print"],[4589715114,"Counting 1–9 Educational Poster | Kids Number Wall Art | Nursery Learning Print"],[4589703929,"Shapes Educational Poster for Kids | Nursery Learning Wall Art | Preschool Room Decor"],[4589703919,"Dinosaur Colours Educational Poster for Kids | Nursery Colour Learning Wall Art"],[4589703441,"Solar System Educational Poster for Kids | Space Nursery Wall Art | Planets Print"],[4597439715,"Capybara Christmas Tree Art Print — Tree Keeper"],[4597439239,"Capybara Christmas Sleigh Art Print — Snowy Delivery"],[4597438717,"Capybara Family Christmas Art Print — Star Gazing"],[4597459888,"Capybara Christmas Gifts Art Print — Quiet Giving"],[4597459356,"Capybara Christmas Bath Art Print — Christmas Bath"],[4597458802,"Sleeping Capybara Christmas Art Print — Festive Slumber"]];
const shopId=50893070;
const sizesFrom=inv=>(inv?.products||[]).filter(p=>!p.is_deleted).map(p=>{
 const matches=(p.property_values||[]).flatMap(v=>(v.values||[]).filter(x=>['A3','A4','A5'].includes(x)));
 return matches.length===1?matches[0]:null;
});
export function correction(d){
 const old=String(d||'');
 let s=old;
 for(const [a,b] of [
 ['A5, A4 and A3','A5 and A4'],['A5, A4 or A3','A5 or A4'],
 ['A3, A4 and A5','A4 and A5'],['A3, A4 or A5','A4 or A5'],
 ['A3, A4, A5','A4, A5'],['A5, A4, A3','A5, A4'],
 ['A3/A4/A5','A4/A5'],['A5/A4/A3','A5/A4']])s=s.split(a).join(b);
 return {text:s,changed:s!==old,unsafe:s.includes('A3')};
}
export async function auditAndMaybeApply({client,mode='audit'}){
 if(!['audit','apply'].includes(mode))throw Error('Unsupported action');
 const account=await client.session();
 if(account.shop_id!==shopId||account.shop_name!=='SapiverPrints')throw Error('Wrong seller');
 const out=[],eligible=[];
 for(const [id,title] of approved){
  try{
   const p=await client.api('/listings/'+id);
   if(p.listing_id!==id||p.shop_id!==shopId||p.title!==title||p.state!=='active'||(p.listing_type!=='physical'&&p.type!=='physical'))throw Error('Unexpected listing');
   const inv=await client.api('/listings/'+id+'/inventory'),sizes=sizesFrom(inv);
   if(!sizes.length||sizes.some(s=>!s))throw Error('Unexpected size variant');
   const types=[...new Set(sizes)].sort().join('|'),desc=correction(p.description);
   if(desc.unsafe)throw Error('Description needs manual size wording');
   if(types==='A4|A5'){out.push({id,status:'already_correct',descriptionEdit:desc.changed});continue;}
   if(types!=='A3|A4|A5')throw Error('Unexpected size combination');
   const payload=makeA4A5Inventory(inv);
   eligible.push({id,title,inv,payload,desc});
   out.push({id,status:'ready',from:sizes.length,to:payload.products.length,descriptionEdit:desc.changed});
  }catch(e){out.push({id,status:'hold',reason:String(e.message||'Invalid provider result').slice(0,96)});}
 }
 if(mode==='audit')return {mode,ready:eligible.length,hold:out.filter(x=>x.status==='hold').length,out};
 if(out.some(x=>x.status==='hold'))return {mode,status:'blocked',out};
 const written=[];
 for(const row of eligible){
  try{
   if(JSON.stringify(await client.api('/listings/'+row.id+'/inventory'))!==JSON.stringify(row.inv))throw Error('Inventory changed');
   await client.api('/listings/'+row.id+'/inventory?max_variations_supported=3',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(row.payload)});
   const check=sizesFrom(await client.api('/listings/'+row.id+'/inventory'));
   if(check.length!==row.payload.products.length||[...new Set(check)].sort().join('|')!=='A4|A5')throw Error('Inventory not verified');
   const p=await client.api('/listings/'+row.id);
   if(p.shop_id!==shopId||p.listing_id!==row.id||p.title!==row.title||p.state!=='active')throw Error('Unexpected listing after inventory PUT');
   if(row.desc.changed){
    await client.api('/shops/'+shopId+'/listings/'+row.id,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({description:row.desc.text}).toString()});
    const again=await client.api('/listings/'+row.id);
    if(again.description!==row.desc.text||again.title!==row.title||again.state!=='active')throw Error('Description not verified');
   }
   written.push({id:row.id,state:'verified',variants:check.length,descriptionUpdated:row.desc.changed});
  }catch(e){written.push({id:row.id,state:'needs_investigation',reason:String(e.message||'Uncertain write').slice(0,96)});break;}
 }
 return {mode,state:written.some(x=>x.state!=='verified')?'needs_investigation':'complete',written,out};
}
