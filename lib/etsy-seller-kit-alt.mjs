// Map verified Pattern Forge seller-preview filenames to the exact Etsy upload order.
// Extra clean front image is inserted before the four packaged previews when present.
// No image pixels, SKU, buyer archive or fulfilment records are changed here.
const MAX=250;
function valid(text){return typeof text==='string'&&text.trim()===text&&text.length>=35&&text.length<=MAX&&!/[<>\x00-\x1f]/.test(text);}
export function sellerKitAltTexts({imported,cleanLead=false,defaults=[],ownerOverrides=[]}={}){
 if(!Array.isArray(defaults)||!defaults.length)throw Error('Missing prepared listing image descriptions');
 let captions=defaults;
 const named=imported?.kit?imported.listingMetadata?.product?.imageAltTextByFilename:null;
 if(named){
  const previews=imported.previews;
  if(!Array.isArray(previews)||previews.length<1||previews.length>10||
     (imported.listingMetadata.product.kind!=='wallpaper'&&previews.length!==4))throw Error('Expected verified seller-kit image previews');
  captions=[...(cleanLead?[imported.listingMetadata.product.cleanLeadAltText]:[]),
   ...previews.map(p=>named[p.name.split('/').pop()])];
  if(captions.length!==defaults.length||captions.some(v=>!valid(v)))throw Error('Seller kit image alt text does not match uploaded preview order');
 }
 if(ownerOverrides.length){
  if(ownerOverrides.length!==defaults.length||ownerOverrides.some(v=>!valid(v)))
   throw Error('Owner alt descriptions must match the number and order of actual Etsy photos');
  captions=ownerOverrides;
 }
 return captions;
}
