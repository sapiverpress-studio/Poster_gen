// Read-only recovery of the exact six Streak artwork masters in the approved
// 2026-11-03 combined ZIP. No image upload, Etsy write or supplier mutation.
// The existing /poster/bulk/trios route remains the sole bundle-reservation path.
import {listProducts} from './product-records.mjs';
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
export async function findPublishedStreakTrioSources({uploads,client}){
 if(!uploads?.get||!uploads?.list||!client?.session)throw Error('Authenticated published-product records required');
 const seller=await client.session();
 if(seller?.shop_id!==STREAK_RECOVERY_SHOP_ID)throw Error('Expected SapiverPrints shop is not connected');
 const records=await listProducts(uploads);
 const candidates=[];
 for(const p of records){
  if(p?.type!=='physical'||p.phase!=='published'||p.metadata?.sectionTitle!==sectionTitle||
     p.pendingRevision||!p.currentRevision||!p.etsyListingId||!p.supplierProductId)continue;
  const a=await uploads.get(assetKey(p.currentRevision),{type:'json',consistency:'strong'});
  if(a?.phase==='published'&&a?.type==='physical'&&a?.listingId===p.etsyListingId&&
     a?.supplierProductId===p.supplierProductId&&a?.masterKey&&a?.plan?.identity?.sku&&a?.image?.sha256)
   candidates.push({id:p.currentRevision,a});
 }
 const items=[];
 for(const item of expected){
  const matches=candidates.filter(({a})=>
   a.image.sha256===item.sha256&&a.metadata?.etsyTitle===item.listingTitle&&
   a.metadata?.sectionTitle===sectionTitle&&
   JSON.stringify(a.metadata?.printSizes)===JSON.stringify(sizes));
  if(matches.length!==1)throw Error(matches.length
   ?'More than one published record matches '+item.title+'. Inspect the saved products; no new listings have been started.'
   :'Missing fully published, supplier-linked Streak poster: '+item.title+'. Inspect its saved product status; do not re-upload.');
  items.push({...item,id:matches[0].id});
 }
 if(new Set(items.map(x=>x.id)).size!==6||new Set(items.map(x=>x.sha256)).size!==6)
  throw Error('The six published source records are not independent');
 const validated=validateTwoTrios(items,trios);
 const inputs=validated.map((t,i)=>({title:t.listingTitle,discount:15,sku:'SP-PENDING-STREAK-'+(i+1)}));
 // Use existing exact-six-plus-two schema before presenting the owner with
 // any bundle reservation option. No supplier SKU is chosen by this helper.
 const plan=makeEightListingPlan({items,trios:validated,inputs});
 if(plan.bundleListings.length!==2)throw Error('Streak two-trio plan is incomplete');
 return {phase:'recovered',sourceCount:6,bundleCount:2,items,trios:validated,inputs};
}
