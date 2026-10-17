// Etsy shop sections are seller-owned. A poster "type" is not a shop section.
// Validate the authenticated worker's snapshot before offering or accepting a section.
const TITLE=/^[^<>\u0000-\u001f\u007f]{1,24}$/;
export function validatedShopSections(source,{shopId,clock=()=>Date.now(),maxAgeMs=86400000}={}){
 const checkedAt=source?.checkedAt??source?.updatedAt;
 if(!Number.isSafeInteger(source?.shopId)||source.shopId<=0||shopId!=null&&source.shopId!==shopId||
    !Number.isFinite(checkedAt)||checkedAt>clock()+30000||clock()-checkedAt>maxAgeMs)throw Error('Etsy shop sections need refreshing');
 const sections=source.sections;
 if(!Array.isArray(sections)||sections.length>20)throw Error('Invalid Etsy shop sections snapshot');
 const seen=new Set(),ids=new Set(),out=[];
 for(const s of sections){
  const id=s.id??s.shop_section_id,title=s.title?.trim();
  if(!Number.isSafeInteger(id)||id<=0||typeof title!=='string'||!TITLE.test(title)||seen.has(title.toLocaleLowerCase('en'))||ids.has(id))throw Error('Etsy section list is inconsistent; refresh it');
  out.push({id,title});seen.add(title.toLocaleLowerCase('en'));ids.add(id);
 }
 return out.sort((a,b)=>a.title.localeCompare(b.title,'en',{sensitivity:'base'}));
}
export function snapshotFromEtsy({shopId,result,clock=()=>Date.now()}){
 const raw={shopId,checkedAt:clock(),sections:result?.results};
 const sections=validatedShopSections(raw,{shopId,clock});
 return {shopId,checkedAt:raw.checkedAt,sections};
}
