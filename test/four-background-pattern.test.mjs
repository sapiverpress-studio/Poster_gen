import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {zipFiles} from '../lib/digital-archive.mjs';
import {inspectDigitalUpload} from '../lib/seller-kit.mjs';
import {digitalListingText} from '../lib/product-metadata.mjs';

const file=(name,data)=>({name,data});
const docs=[
 file('README.txt',Buffer.from('One transparent original; three coloured seamless pattern versions, two PNG sizes each.')),
 file('LICENSE.txt',Buffer.from('Commercial finished-product use permitted. Source redistribution prohibited.')),
 file('ABOUT-SAPIVER-PRINTS.txt',Buffer.from('Sapiver Prints creates digital seamless patterns.'))
];
const masterName='sapiver-demo-seamless-master.png';
const transparent=await sharp({
 create:{width:500,height:500,channels:4,background:{r:0,g:0,b:0,alpha:0}}
}).composite([{input:Buffer.from('<svg width="180" height="180"><circle cx="90" cy="90" r="80" fill="#346070"/></svg>'),left:150,top:150}]).png().toBuffer();
const shades=['#f7eee2','#d6e7ec','#b9cdbe'],assets=[];
for(let i=0;i<3;i++){
 const arr=[];
 for(const n of [1800,900]){
  const name='sapiver-demo-colour-'+(i+1)+'-'+shades[i].slice(1)+'-'+n+'x'+n+'.png';
  const data=await sharp({create:{width:n,height:n,channels:4,background:shades[i]}}).png().toBuffer();
  arr.push({name,data,width:n,height:n,dpi:300,bytes:data.length});
 }
 assets.push(arr);
}
const manifest={
 format:'sapiver-four-background-pattern',version:1,
 transparent:{name:masterName,width:500,height:500,dpi:300,reconstructionParts:0},
 backgrounds:shades.map((colour,i)=>({
   colour,files:assets[i].map(({name,width,height,dpi,bytes})=>({name,width,height,dpi,bytes}))
 })),
 buyerRestorationRequired:false
};
const previews=[file('LISTING-IMAGES/sapiver-demo-four-backgrounds.jpg',
 await sharp({create:{width:1200,height:900,channels:3,background:'#f1efec'}}).jpeg().toBuffer())];
async function outerArchive(groups){
 const buyer=[];
 for(let i=0;i<groups.length;i++)buyer.push(file('UPLOAD-TO-ETSY/sapiver-demo-buyer-0'+(i+1)+'.zip',await zipFiles(groups[i])));
 return zipFiles([...buyer,...previews,file('SELLER-CHECKLIST.txt',Buffer.from('Seller review required.'))]);
}
const groups=[
 [file(masterName,transparent),...docs],
 ...assets.map((arr,i)=>[
   ...arr.map(x=>file(x.name,x.data)),
   ...(i===0?[file('SAPIVER-FOUR-VARIANTS.json',Buffer.from(JSON.stringify(manifest)))]:[]),...docs
 ])
];
test('one seller kit imports four customer ZIPs: transparent + three colours in two sizes',async()=>{
 const prepared=await inspectDigitalUpload(await outerArchive(groups),{requireDocumentsPerBuyerZip:true});
 assert.equal(prepared.kit,true);
 assert.equal(prepared.packages.length,4);
 const pngs=prepared.inspection.files.filter(f=>f.format==='png');
 assert.equal(pngs.length,7);
 assert.ok(pngs.some(f=>f.name===masterName&&f.width===500&&f.height===500));
 const desc=digitalListingText({
   name:'Christmas steam pattern',kind:'pattern',subject:'steam trains',
   description:'Coherent Christmas train seamless repeat',
   instructions:prepared.instructions,licence:prepared.licence,tags:['christmas trains']
 },prepared.inspection.files).description;
 assert.match(desc,/FOUR SEAMLESS PATTERN BACKGROUNDS/);
 assert.match(desc,/Background 3/);
 assert.match(desc,/1800 × 1800 px PNG/);
 assert.match(desc,/900 × 900 px PNG/);
});
test('missing one colour-size PNG is rejected before Etsy writes',async()=>{
 const incomplete=groups.map(arr=>arr.slice());
 incomplete[3]=incomplete[3].filter(f=>!f.name.endsWith('900x900.png'));
 await assert.rejects(inspectDigitalUpload(await outerArchive(incomplete),{requireDocumentsPerBuyerZip:true}),/do not match the exported product manifest/);
});
test('misleading colour-file manifest is rejected',async()=>{
 const wrong={...manifest,backgrounds:manifest.backgrounds.map(x=>({...x}))};
 wrong.backgrounds[2]={...wrong.backgrounds[2],colour:'#ffffff'};
 const altered=groups.map(arr=>arr.slice());
 altered[1]=altered[1].map(f=>f.name==='SAPIVER-FOUR-VARIANTS.json'?file(f.name,Buffer.from(JSON.stringify(wrong))):f);
 await assert.rejects(inspectDigitalUpload(await outerArchive(altered),{requireDocumentsPerBuyerZip:true}),/Invalid coloured PNG in four-background Etsy package/);
});