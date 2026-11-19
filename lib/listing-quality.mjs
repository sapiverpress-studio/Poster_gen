// Read-only, Etsy-specific review for both physical and digital products.
// These are format/relevance heuristics, not claims about search volume or ranking.
export function listingQualityWarnings({productType='physical',artworkName='',listingTitle='',description='',tags=[],taxonomyPath=''}={}){
 const warnings=[];
 const digital=productType==='digital';
 const title=String(listingTitle).trim();
 const name=String(artworkName).trim();
 const words=Array.isArray(tags)?tags:String(tags||'').split(',');
 const phrases=words.map(tag=>String(tag).trim()).filter(Boolean);
 if(name&&title.toLowerCase()===name.toLowerCase())warnings.push('Etsy title matches the short artwork name. Add the visible subject and '+(digital?'digital product type':'physical product type')+' for buyers.');
 if(!digital&&!/\b(?:prints?|posters?|wall art)\b/i.test(title))warnings.push('Etsy title does not explicitly identify an art print, poster or wall art. Check that buyers can tell what it is.');
 if(digital&&!/\b(?:digital|download|printable|png|svg|pattern|template|bundle)\b/i.test(title))warnings.push('Digital listing title does not describe a digital product. Identify the downloadable artwork or pattern clearly.');
 if(title.split(/\s+/).filter(Boolean).length>15)warnings.push('Etsy recommends concise, readable titles, preferably fewer than 15 words. Remove repetitive keywords if possible.');
 if(title.length>140)warnings.push('Etsy title exceeds the 140-character maximum.');
 if(digital&&!/\b(?:digital download|no physical item|nothing will be shipped)\b/i.test(description))warnings.push('Digital description should clearly tell buyers that nothing physical is shipped.');
 const assertedDigitalDelivery=String(description).replace(/\b(?:not|no|without)\s+(?:an?\s+)?(?:digital download|instant download|printable file)\b/gi,'');
 if(!digital&&/\b(?:digital download|instant download|printable file)\b/i.test(assertedDigitalDelivery))warnings.push('Physical description appears to promise a digital file. Check that buyers know this is a shipped print.');
 if(phrases.length!==13)warnings.push('Only '+phrases.length+' of 13 Etsy tags are present. Supply 13 truthful, specific phrases rather than the generic fallback.');
 if(phrases.some(tag=>tag.length>20))warnings.push('One or more Etsy tags exceed the 20-character maximum.');
 if(new Set(phrases.map(s=>s.toLocaleLowerCase('en-GB'))).size!==phrases.length)warnings.push('Duplicate Etsy tags waste available search phrases.');
 const singles=phrases.filter(tag=>tag.split(/\s+/).length===1);
 if(singles.length>=4)warnings.push('Several tags are single words. Where accurate, prefer varied multi-word buyer phrases.');
 const broad=new Set(digital?['digital','download','digital download','art','pattern','seamless','surface pattern design','continuous pattern','repeat print']:['art print','wall art','print','poster','printed wall art','framed print']);
 if(phrases.filter(tag=>broad.has(tag.toLowerCase())).length>=2)warnings.push('Several tags are generic. Consider replacing some with accurate subject, style or buyer-purpose phrases.');
 if(!digital&&/\bDigital Prints\b/i.test(String(taxonomyPath)))warnings.push('Marketplace taxonomy says Digital Prints. Verify that this category suits a physical print; listing type and fulfilment are separate from taxonomy.');
 if(digital&&/\b(?:Physical Prints?|Framed Prints?)\b/i.test(String(taxonomyPath)))warnings.push('Marketplace taxonomy appears physical. Check the category before offering a download.');
 return warnings;
}
