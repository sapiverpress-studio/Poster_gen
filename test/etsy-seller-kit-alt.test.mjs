import test from 'node:test';
import assert from 'node:assert/strict';
import {sellerKitAltTexts} from '../lib/etsy-seller-kit-alt.mjs';
const filenames=['01-pattern.jpg','02-repeat.jpg','03-cushion-visualisation.jpg','04-files-and-detail.jpg'];
const alts={
 '01-pattern.jpg':'Full view of cranberry and green leaf artwork on a cream seamless pattern.',
 '02-repeat.jpg':'Two-by-two repetition showing red berries and green leaves across the joined tiles.',
 '03-cushion-visualisation.jpg':'Illustrative cushion covered in cranberry floral print; no cushion is supplied.',
 '04-files-and-detail.jpg':'Detail and included digital artwork file information presented on a listing panel.'
};
const lead='Clean full view of the cranberry and green leaf digital pattern on a cream background.';
const prepared={kit:true,previews:filenames.map(name=>({name:'LISTING-IMAGES/'+name})),listingMetadata:{product:{imageAltTextByFilename:alts,cleanLeadAltText:lead}}};
const defaults=['Generic full image view.','Generic repeat design view.','Generic mock-up view.','Generic files view.'];
test('Pattern Forge alt text follows exact ZIP filenames and clean lead order',()=>{
 assert.deepEqual(sellerKitAltTexts({imported:prepared,cleanLead:false,defaults}),Object.values(alts));
 assert.deepEqual(sellerKitAltTexts({imported:prepared,cleanLead:true,defaults:['Clean. ',...defaults]}),[lead,...Object.values(alts)]);
});
test('owner review overrides are chosen without reordering customer artwork',()=>{
 const overrides=Object.values(alts).map(s=>'Reviewed: '+s);
 assert.deepEqual(sellerKitAltTexts({imported:prepared,defaults,ownerOverrides:overrides}),overrides);
});
test('legacy ZIPs retain established default without inventing image roles',()=>{
 assert.deepEqual(sellerKitAltTexts({imported:{kit:false},defaults}),defaults);
});
test('partial mapping, unexpected counts and invalid edits fail closed',()=>{
 assert.throws(()=>sellerKitAltTexts({imported:prepared,defaults:['only one image']}),/match uploaded preview order/);
 assert.throws(()=>sellerKitAltTexts({imported:prepared,defaults,ownerOverrides:['one']}),/match the number/);
 const changed=structuredClone(prepared);delete changed.listingMetadata.product.imageAltTextByFilename['04-files-and-detail.jpg'];
 assert.throws(()=>sellerKitAltTexts({imported:changed,defaults}),/match uploaded preview order/);
});
