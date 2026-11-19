// Optional, owner-reviewed Etsy copy overlays for ZIP bulk uploads.
// Only listing text changes: no ZIP entries, artwork, sizes, prices or membership.
const fail=message=>{throw Error('Etsy SEO review: '+message);};
const tagList=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
const physical=/\b(?:posters?|prints?|wall art)\b/i;
const digitalTag=/\b(?:digital download|downloadable|printable file|svg file)\b/i;
export function applyBulkEtsySeo(archive,review){
 if(!archive||!Array.isArray(archive.items)||!review||
    !Array.isArray(review.items)||review.items.length!==archive.items.length||
    !Array.isArray(review.bundles)||review.bundles.length!==(archive.bundles||[]).length)
    fail('analysis must match every poster and the exact trio count');
 const build=(original,fields,isTrio,index)=>{
  if(!fields||typeof fields!=='object')fail('listing '+(index+1)+' is missing');
  const listingTitle=String(fields.title||'').trim();
  const tags=tagList(fields.tags);
  const lead=String(fields.lead||'').trim();
  const artworkAltText=isTrio?'':String(fields.altText||'').trim();
  if(artworkAltText&&(artworkAltText.length>250||/[<>\x00-\x1f]/.test(artworkAltText)))fail('listing '+(index+1)+' has invalid accessible artwork text');
  if(!listingTitle||listingTitle.length>140||!physical.test(listingTitle)||/[<>\x00-\x1f]/.test(listingTitle))
   fail('listing '+(index+1)+' must identify a physical print in at most 140 characters');
  if(isTrio&&!/\b(?:set|trio|bundle|collection)\b/i.test(listingTitle))
   fail('trio '+(index+1)+' title must identify a set of prints');
  if(tags.length!==13||new Set(tags.map(x=>x.toLowerCase())).size!==13||
    tags.some(x=>!x||x.length>20||/[<>\x00-\x1f]/.test(x)||digitalTag.test(x)))
    fail('listing '+(index+1)+' requires 13 unique, truthful physical-print tags of up to 20 characters');
  if(!lead||lead.length>1600||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(lead))
   fail('listing '+(index+1)+' needs a short checked image-description opening');
  const description=lead+'\n\n'+original.description;
  if(description.length>9000)fail('listing '+(index+1)+' exceeds Etsy description length; shorten the opening');
  if(isTrio&&(!/\b(?:three|3)\b/i.test(description)||!description.includes(original.size)))
   fail('trio '+(index+1)+' must retain the three-print size details');
  return {...original,listingTitle,tags,description,...(artworkAltText?{artworkAltText}:{})};
 };
 const items=archive.items.map((p,i)=>build(p,review.items[i],false,i));
 const bundles=(archive.bundles||[]).map((b,i)=>build(b,review.bundles[i],true,i));
 return {...archive,items,bundles,artwork:archive.artwork};
}
