// One-purpose Etsy seller API operation for the Streak shop section.
// Invoke only from a separately owner-authorised authenticated worker action.
// This module has no startup side effects and does not modify listings.
import {ensureSection} from './product-records.mjs';
import {snapshotFromEtsy} from './etsy-section-snapshot.mjs';

export const STREAK_SECTION_TITLE='Streak';
export const TRIO_COLLECTION_SECTION_TITLE='Trio Collection';
export function verifiedTrioSectionId(sectionResponse){
 const rows=sectionResponse?.results;
 if(!Array.isArray(rows)||rows.length>20)throw Error('Etsy sections unavailable for trio review');
 const matches=rows.filter(x=>typeof x?.title==='string'&&x.title.trim().toLowerCase()==='trio collection');
 if(matches.length!==1||!Number.isSafeInteger(matches[0].shop_section_id)||matches[0].shop_section_id<=0)
  throw Error('Trio Collection Etsy section missing or ambiguous. Verify the shop section before publishing.');
 return matches[0].shop_section_id;
}
const EXPECTED_SHOP_ID=50893070;
const EXPECTED_SHOP_NAME='SapiverPrints';

export async function createStreakSectionThroughEtsyApi({client,etsyStore,uploads,clock=()=>Date.now()}) {
 return createVerifiedSection({client,etsyStore,uploads,clock,title:STREAK_SECTION_TITLE});
}
export async function createTrioCollectionSectionThroughEtsyApi({client,etsyStore,uploads,clock=()=>Date.now()}) {
 return createVerifiedSection({client,etsyStore,uploads,clock,title:TRIO_COLLECTION_SECTION_TITLE});
}
async function createVerifiedSection({client,etsyStore,uploads,clock,title}) {
 if(!client?.session||!client?.api||!etsyStore?.setJSON||!uploads?.setJSON)throw Error('Authenticated Etsy seller API and private stores required');
 const seller=await client.session();
 if(seller?.shop_id!==EXPECTED_SHOP_ID||seller?.shop_name!==EXPECTED_SHOP_NAME)throw Error('Wrong Etsy seller for shop section');
 if(!String(seller.scope||'').split(/\s+/).includes('shops_w'))throw Error('Etsy shops_w authorisation required');
 const path='/shops/'+seller.shop_id+'/sections';
 const before=await client.api(path);
 if(!Array.isArray(before?.results)||before.results.length>20)throw Error('Etsy shop sections unavailable or invalid');
 const matches=before.results.filter(s=>typeof s.title==='string'&&s.title.trim().toLowerCase()===title.toLowerCase());
 if(matches.length>1)throw Error('Duplicate shop sections require investigation');
 if(matches.length===1&&(!Number.isSafeInteger(matches[0].shop_section_id)||matches[0].shop_section_id<=0))throw Error('Existing shop section ID is invalid');
 // ensureSection reads first, POSTs only if missing, and checks the result again.
 // Its private reservation prevents uncertain retries of an ambiguous POST.
 const sectionId=await ensureSection({client,shopId:seller.shop_id,title,store:etsyStore});
 const after=await client.api(path);
 const snapshot=snapshotFromEtsy({shopId:seller.shop_id,result:after,clock});
 if(snapshot.sections.filter(s=>s.title.toLowerCase()===title.toLowerCase()&&s.id===sectionId).length!==1)
  throw Error('Etsy section readback mismatch');
 // Refresh the existing uploader's actual seller-derived section snapshot.
 // A section present in source code but absent here must never be offered.
 await uploads.setJSON('template/sections',snapshot);
 return {phase:'verified',shopId:seller.shop_id,sectionId,title,created:matches.length===0,checkedAt:snapshot.checkedAt};
}
