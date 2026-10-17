// Advisory only: never invent keyword demand or rewrite buyer-authored metadata.
export function listingQualityWarnings({artworkName='',listingTitle='',tags=[],taxonomyPath=''}={}){
 const warnings=[];
 const title=String(listingTitle).trim();
 const name=String(artworkName).trim();
 const words=Array.isArray(tags)?tags:String(tags||'').split(',');
 const phrases=words.map(tag=>String(tag).trim()).filter(Boolean);
 if(name&&title.toLowerCase()===name.toLowerCase())warnings.push('Etsy title matches the short artwork name. Add the visible subject and physical product type for buyers.');
 if(!/\b(?:prints?|posters?|wall art)\b/i.test(title))warnings.push('Etsy title does not explicitly identify an art print, poster or wall art. Check that buyers can tell what it is.');
 if(phrases.length!==13)warnings.push('Only '+phrases.length+' of 13 Etsy tags are present. Supply 13 truthful, specific phrases rather than the generic fallback.');
 const singles=phrases.filter(tag=>tag.split(/\s+/).length===1);
 if(singles.length>=4)warnings.push('Several tags are single words. Where accurate, prefer varied multi-word buyer phrases.');
 const broad=new Set(['art print','wall art','print','poster','printed wall art','framed print']);
 if(phrases.filter(tag=>broad.has(tag.toLowerCase())).length>=2)warnings.push('Several tags are generic. Consider replacing some with accurate subject, style or room phrases.');
 if(/\bDigital Prints\b/i.test(String(taxonomyPath)))warnings.push('Marketplace taxonomy says Digital Prints. Verify that this category suits a physical print; listing type and fulfilment are separate from taxonomy.');
 return warnings;
}
