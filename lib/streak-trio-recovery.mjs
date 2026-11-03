// Read-only recovery of the exact six Streak artwork masters in the approved
// 2026-11-03 combined ZIP. No image upload, Etsy write or supplier mutation.
// The existing /poster/bulk/trios route remains the sole bundle-reservation path.
import {recordKey} from './product-records.mjs';
import {assetKey} from './uploaded-poster.mjs';
import {validateTwoTrios,makeEightListingPlan} from '../public/collection-trios.mjs';

export const STREAK_RECOVERY_SHOP_ID=50893070;
const sizes=['A5','A4'],sectionTitle='Streak';
const source=Object.freeze([
 ['01-Blame','The Blame','Sarcastic Hedgehog Newspaper Print | The Blame | Black and White A4 A5 Wall Art','86030936d3352c50e708ba813c4b88cc95f232759f858d9fb193e41ae06aea30'],
 ['02-Democracy','Democracy','Democracy Hedgehog Newspaper Print | British Sarcastic Black White Wall Art A4 A5','441da4f7c097cf6327ff3a1385e0ca47dac96a74d14c5bb993c0c1e170377209'],
 ['03-Experts','The Experts','The Experts Hedgehog Print | Sarcastic News Wall Art | Black White A4 A5','bf21c1a1993ae9e9e69cc633d1ba8fab4e15a9bd50402251561af2a9aa89b5b7'],
 ['04-Meetings','Another Meeting','Another Meeting Hedgehog Print | Dry British Humour Black White A4 A5 Wall Art','bfcba4da7375f44b70a8946e52b166b6bff93cd0acbf9abd0bb0d391a2d12d2a'],
 ['05-Comments','Comment Section','Comment Section Hedgehog Print | Sarcastic British Wall Art A4 A5 Black White','231dc2c3afe060b7f1f9ca3b5e5dcc2383d24c7629402dd403f9709af307e4de'],
 ['06-History','Historic Disaster','Historic Disaster Hedgehog Print | Sarcastic Black White News Wall Art A4 A5','9ea92184517be92c661942869f26399c872cba156118611e6cdb97f9697049ba']
]);
const commonTags='sarcastic wall art,hedgehog print,black white art,british humour,dry humour print,marker pen art,scribble art,newspaper humour,office wall decor,living room art,funny animal art,unframed poster';
const bundleOneDescription=[
 'Three unframed A4 portrait prints from the Streak collection, featuring The Blame, Democracy, The Experts.',
 'Set one covers blame, democracy and news commentary.',
 'You receive three separate physical black-and-white A4 paper prints, not digital files and not frames.',
 'The drawings use rough black-marker scribble styling on white backgrounds, with short, dry British sarcastic captions.',
 'The illustrations were AI-assisted and prepared for print by Sapiver Prints.',
 'Please review supplier bundle size, unframed options, artwork proof, and Etsy product settings before approving publication.'
].join('\n');
const bundleTwoDescription=[
 'Three unframed A4 portrait prints from the Streak collection, featuring Another Meeting, Comment Section, Historic Disaster.',
 'Set two covers meetings, comment sections and recurring crises.',
 'You receive three separate physical black-and-white A4 paper prints, not digital files and not frames.',
 'The drawings use rough black-marker scribble styling on white backgrounds, with short, dry British sarcastic captions.',
 'The illustrations were AI-assisted and prepared for print by Sapiver Prints.',
 'Please review supplier bundle size, unframed options, artwork proof, and Etsy product settings before approving publication.'
].join('\n');
const trios=[
 {title:'Streak Trio 1',listingTitle:'Streak Set 1 | Three Black White Sarcastic Hedgehog A4 Prints',sectionTitle,size:'A4',members:['01-Blame','02-Democracy','03-Experts'],tags:(commonTags+',satirical news set').split(','),description:bundleOneDescription},
 {title:'Streak Trio 2',listingTitle:'Streak Set 2 | Three Black White Sarcastic Hedgehog A4 Prints',sectionTitle,size:'A4',members:['04-Meetings','05-Comments','06-History'],tags:(commonTags+',office satire set').split(','),description:bundleTwoDescription}
];
const expected=source.map(([folder,title,listingTitle,sha256])=>({folder:'Streak/'+folder,title,listingTitle,sectionTitle,printSizes:[...sizes],sha256,filename:'Streak/'+folder+'/poster.png'}));
// These are the six actual individual-poster approval IDs captured in the
// site's 2026-11-03 17:55:53–17:56:04 UTC owner-approved POST logs,
// in the exact order of the six posters in the combined Streak ZIP.
// Recovery is deliberately scoped to these receipts, not every product whose
// title happens to contain "Streak".
export const STREAK_APPROVED_UPLOAD_IDS=Object.freeze([
 'kvKouwHsR_qX2JUa4tWaM7A9EyTbBUar',
 'MTLLSgqzYTFxW9ncjbnPumIzQGigHFon',
 'lr8EJelnbwar0m88Ptoj0AvF7eA8FuQ2',
 'YAOBgMka_vvvJ9St5M5X9J9NLZeUn_Lf',
 'zmInOlFQGvzdiTbt2M7aQGflUbUIAgHp',
 'WZdlBvUE-8IRIegj4Y9m9CMirYFPVH4b'
]);
const distinctNames=['blame','democracy','experts','meeting','comment','disaster'];
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{32}$/.test(x);
export async function findPublishedStreakTrioSources({uploads,client}){
 if(!uploads?.get||!client?.session)throw Error('Authenticated published-product records required');
 const seller=await client.session();
 if(seller?.shop_id!==STREAK_RECOVERY_SHOP_ID)throw Error('Expected SapiverPrints shop is not connected');
 const items=[], sourceDifferences=[];
 for(let i=0;i<expected.length;i++){
  const meta=expected[i],id=STREAK_APPROVED_UPLOAD_IDS[i];
  if(!validId(id))throw Error('Streak approved upload receipt is invalid');
  const a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
  if(!a)throw Error('Streak '+meta.title+': original approved upload record not found. Do not re-upload.');
  const productId=a.productId||id;
  if(!validId(productId))throw Error('Streak '+meta.title+': saved product identity invalid');
  const p=await uploads.get(recordKey(productId),{type:'json',consistency:'strong'});
  if(!p)throw Error('Streak '+meta.title+': saved product revision unavailable; original Etsy listing is retained.');
  if(a.phase!=='published'||p.phase!=='published'||p.currentRevision!==id||p.pendingRevision)
   throw Error('Streak '+meta.title+': uploader state is '+(a.phase||'unknown')+'/'+(p.phase||'unknown')+
    '. Confirm publication and revision before preparing the two bundles.');
  if(a.type!=='physical'||p.type!=='physical'||a.metadata?.sectionTitle!==sectionTitle||p.metadata?.sectionTitle!==sectionTitle)
   throw Error('Streak '+meta.title+': saved physical print or shop section differs; stopped without changes.');
  if(!a.listingId||a.listingId!==p.etsyListingId)
   throw Error('Streak '+meta.title+': Etsy listing receipt missing or mismatched; stopped without changes.');
  if(!a.supplierProductId||a.supplierProductId!==p.supplierProductId)
   throw Error('Streak '+meta.title+': PrintShrimp product mapping is not verified. Existing Etsy listing is retained; no duplicates created.');
  if(!a.masterKey||!a.plan?.identity?.sku||!/^[a-f0-9]{64}$/.test(a.image?.sha256||''))
   throw Error('Streak '+meta.title+': approved master or SKU fingerprint unavailable; stopped without changes.');
  if(JSON.stringify(a.metadata?.printSizes)!==JSON.stringify(sizes))
   throw Error('Streak '+meta.title+': approved A5/A4 sizes differ; stopped without changes.');
  const label=String(a.metadata?.name||'')+' '+String(a.metadata?.etsyTitle||'');
  if(!label.toLowerCase().includes(distinctNames[i]))
   throw Error('Streak '+meta.title+': saved title does not match the original approved poster order; do not bundle a different artwork.');
  if(!String(a.metadata?.etsyTitle||'').trim()||a.metadata.etsyTitle.length>140)
   throw Error('Streak '+meta.title+': approved Etsy title unavailable.');
  if(a.image.sha256!==meta.sha256)sourceDifferences.push(meta.title);
  // The published listing and its supplier-linked immutable image are the
  // authority. The local ZIP may have been exported again with different PNG
  // byte encoding. Never invent a hash or recreate an individual listing.
  items.push({...meta,id,sha256:a.image.sha256,listingTitle:a.metadata.etsyTitle});
 }
 if(new Set(items.map(x=>x.id)).size!==6||
    new Set(items.map(x=>x.sha256)).size!==6)
  throw Error('The six published sources are not distinct; no bundle review created');
 const validated=validateTwoTrios(items,trios);
 const inputs=validated.map((t,i)=>({title:t.listingTitle,discount:15,sku:'SP-PENDING-STREAK-'+(i+1)}));
 const plan=makeEightListingPlan({items,trios:validated,inputs});
 if(plan.bundleListings.length!==2)throw Error('Streak two-trio plan is incomplete');
 return {phase:'recovered',sourceCount:6,bundleCount:2,items,trios:validated,inputs,sourceDifferences};
}
