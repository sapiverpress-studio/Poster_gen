// Exact older-trio recovery from verified same-shop individual listing art.
// Only approved ID-to-ID mappings may be recovered; no title-based guessing.
import sharp from 'sharp';
import {composeTrioCover,imageHash} from './clean-listing-image.mjs';

export const LEGACY_TRIOS=Object.freeze({
  4617196639:Object.freeze({
    title:"Eclectic Wall Art Set of 3 A4 Prints",
    members:Object.freeze([
      Object.freeze({id:4617203678,title:"Moka Pot Coffee Wall Art Print"}),
      Object.freeze({id:4617194565,title:"Amethyst Geode Wall Art Print"}),
      Object.freeze({id:4617194011,title:"Mountain Cycling Wall Art Print"})
    ])
  }),
  4613186929:Object.freeze({
    title:"Funny Sarcastic Animal Wall Art Set of 3 A4 Prints",
    members:Object.freeze([
      Object.freeze({id:4613147292,title:"Funny Hedgehog Wall Art Print - Six Minutes"}),
      Object.freeze({id:4613147936,title:"Sarcastic Hedgehog Wall Art Print - So Many Opinions"}),
      Object.freeze({id:4613147688,title:"Funny Sloth Wall Art Print"})
    ])
  }),
  4613060911:Object.freeze({
    title:"Modern Eclectic Whole House Collection Set of 3 A4 Wall Art Prints",
    members:Object.freeze([
      Object.freeze({id:4613076290,title:"Red Staircase Architectural Wall Art Print"}),
      Object.freeze({id:4613075848,title:"Blue Green Abstract River Wall Art Print"}),
      Object.freeze({id:4613076076,title:"Sewing Scissors Textile Still Life Wall Art Print"})
    ])
  }),
  4610368914:Object.freeze({
    title:"Blue and Copper Whole House Collection Set of 3 A4 Wall Art Prints",
    members:Object.freeze([
      Object.freeze({id:4610367326,title:"Grey Heron Wildlife Bird Wall Art Print"}),
      Object.freeze({id:4610346075,title:"Pottery Studio Cobalt Blue Ceramic Wall Art Print"}),
      Object.freeze({id:4610346743,title:"Ivory Chess Knight Contemporary Wall Art Print"})
    ])
  }),
  4609483175:Object.freeze({
    title:"Streak Set 1",
    members:Object.freeze([
      Object.freeze({id:4609470767,title:"Sarcastic Hedgehog Newspaper Print | The Blame"}),
      Object.freeze({id:4609136276,title:"Democracy Hedgehog Newspaper Print"}),
      Object.freeze({id:4609114425,title:"The Experts Hedgehog Print"})
    ])
  }),
  4609504500:Object.freeze({
    title:"Streak Set 2",
    members:Object.freeze([
      Object.freeze({id:4609115937,title:"Another Meeting Hedgehog Print"}),
      Object.freeze({id:4609116423,title:"Comment Section Hedgehog Print"}),
      Object.freeze({id:4609115047,title:"Historic Disaster Hedgehog Print"})
    ])
  }),
  4600182933:Object.freeze({
    title:"Woodland Verse Prints - Badger Red Squirrel",
    members:Object.freeze([
      Object.freeze({id:4599437738,title:"Badger Woodland Wildlife Verse Print"}),
      Object.freeze({id:4599399281,title:"Red Squirrel Woodland Verse Print"}),
      Object.freeze({id:4599438228,title:"Roe Deer British Woodland Verse Print"})
    ])
  }),
  4600180569:Object.freeze({
    title:"Woodland Verse Prints - Fox Robin Hedgehog",
    members:Object.freeze([
      Object.freeze({id:4595277551,title:"Fox Print with Original Woodland Verse"}),
      Object.freeze({id:4595921846,title:"The Robin Wall Art Print"}),
      Object.freeze({id:4595944801,title:"The Hedgehog Wall Art Print"})
    ])
  })
});
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{32}$/.test(id);
const goodId=n=>Number.isSafeInteger(n)&&n>0;
const MAX_BYTES=10_000_000;
export const knownLegacyTrio=id=>Object.hasOwn(LEGACY_TRIOS,id);

async function savedOriginal({uploads,products,id}){
 const records=products.filter(p=>p?.etsyListingId===id);
 if(records.length>1)throw Error('Legacy trio member has duplicate stored product records');
 if(!records.length)return null;
 const p=records[0];
 if(p.type!=='physical'||p.pendingRevision||!validId(p.currentRevision))return null;
 const asset=await uploads.get('uploads/'+p.currentRevision+'/state',{type:'json',consistency:'strong'});
 if(!asset||asset.type!=='physical'||asset.phase!=='published'||asset.listingId!==id||
    (asset.productId&&asset.productId!==p.productId)||!asset.masterKey||
    !/^[a-f0-9]{64}$/.test(asset.image?.sha256||''))return null;
 const bytes=await uploads.get(asset.masterKey,{type:'arrayBuffer',consistency:'strong'});
 if(!bytes||imageHash(Buffer.from(bytes))!==asset.image.sha256)
  throw Error('Legacy trio member saved artwork checksum mismatch');
 return Buffer.from(bytes);
}
async function sellerImage({client,member,shopId,request}){
 const images=await client.api('/listings/'+member.id+'/images');
 const photos=images?.results;
 if(!Array.isArray(photos)||!photos.length)throw Error('Legacy trio member image gallery missing');
 const leads=photos.filter(p=>p.rank===1&&p.listing_id===member.id&&goodId(p.listing_image_id));
 if(leads.length!==1||!String(leads[0].alt_text||'').startsWith('Sapiver artwork-first:'))
  throw Error('Legacy trio member is missing a verified clean first image');
 const raw=leads[0].url_fullxfull;
 let url;try{url=new URL(raw)}catch{throw Error('Legacy trio image URL unavailable')}
 if(url.protocol!=='https:'||url.hostname!=='i.etsystatic.com'||url.username||url.password)
  throw Error('Legacy trio member image host is not approved');
 const response=await request(url.toString(),{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});
 const stated=Number(response.headers.get('content-length')||0);
 if(!response.ok||!/^image\/(?:jpeg|png)(?:;|$)/i.test(response.headers.get('content-type')||'')||
    stated>MAX_BYTES)throw Error('Legacy trio member artwork download unavailable');
 const data=Buffer.from(await response.arrayBuffer());
 if(!data.length||data.byteLength>MAX_BYTES)throw Error('Legacy trio member image exceeds safe limit');
 const meta=await sharp(data,{limitInputPixels:100_000_000,failOn:'warning'}).metadata();
 if(!['jpeg','png'].includes(meta.format)||meta.width<600||meta.height<600||(meta.pages||1)!==1)
  throw Error('Legacy trio member artwork image is invalid');
 // Etsy's already-reviewed artwork-first hero is square with white padding.
 // Remove only its surrounding white background before fitting on portrait paper.
 return sharp(data,{limitInputPixels:100_000_000}).rotate()
  .trim({background:'#ffffff',threshold:6}).png().toBuffer();
}
export async function recoverLegacyTrioCover({client,uploads,listing,shopId,products,request=fetch}){
 const spec=LEGACY_TRIOS[listing?.listing_id];
 if(!spec)return null;
 if(listing.shop_id!==shopId||listing.listing_type!=='physical'||listing.state!=='active'||
    !String(listing.title||'').startsWith(spec.title))
  throw Error('Legacy trio identity differs from approved source mapping');
 const originals=[];
 for(const member of spec.members){
  const live=await client.api('/listings/'+member.id);
  if(live?.listing_id!==member.id||live.shop_id!==shopId||live.state!=='active'||
     live.listing_type!=='physical'||!String(live.title||'').startsWith(member.title))
   throw Error('One of the three original Etsy prints has changed identity');
  const stored=await savedOriginal({uploads,products,id:member.id});
  originals.push(stored||await sellerImage({client,member,shopId,request}));
 }
 return {front:await composeTrioCover(originals),memberListingIds:spec.members.map(x=>x.id)};
}
