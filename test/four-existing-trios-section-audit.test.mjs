import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOP,FOUR_TRIOS,auditFourTrioSections} from '../lib/four-existing-trios-section-audit.mjs';
function fixture({a3=false,wrong=false}={}){
 let writes=0;
 const client={
  session:async()=>({shop_id:SHOP,shop_name:'SapiverPrints'}),
  api:async (path,opts)=>{
   if(opts?.method){writes++;throw Error('Read-only audit attempted a mutation')}
   if(path==='/shops/'+SHOP+'/sections')return{results:[{shop_section_id:123,title:'Trio Collection'}]};
   const m=/^\/listings\/(\d+)(\?includes=Images|\/inventory)$/.exec(path);
   if(!m)throw Error('unexpected Etsy read '+path);
   const id=Number(m[1]),spec=FOUR_TRIOS.find(x=>x.id===id);
   if(!spec)throw Error('unexpected listing');
   if(m[2]==='/inventory')return{products:[
    {sku:'SKU-'+id,property_values:[{property_name:'Size',values:[a3?'A3':'A4']}],
     offerings:[{price:18,quantity:10}]}
   ]};
   return{listing_id:id,shop_id:SHOP,state:'active',listing_type:'physical',
    title:(wrong&&id===FOUR_TRIOS[0].id?'Unrelated wall art':spec.titlePrefix+' A4 Prints'),
    shop_section_id:null,taxonomy_id:42,shipping_profile_id:61,images:[{listing_image_id:1}]};
  }
 };
 return {client,mutations:()=>writes};
}
test('four existing three-print Etsy listings are identified and no writes are made',async()=>{
 const f=fixture();const r=await auditFourTrioSections(f);
 assert.equal(r.toMove,4);assert.equal(r.listings.length,4);
 assert.equal(r.noSellerMutation,true);
 assert.ok(r.listings.every(x=>x.sizeMode==='explicit_sizes'&&x.inventorySizes.join(',')==='A4'));
 assert.equal(f.mutations(),0);
});
test('A3 is reported but not removed by a read-only audit',async()=>{
 const f=fixture({a3:true});const r=await auditFourTrioSections(f);
 assert.ok(r.listings.every(x=>x.hasUnverifiedSize));
 assert.equal(f.mutations(),0);
});
test('any unexpected listing title blocks all categorisation',async()=>{
 const f=fixture({wrong:true});
 await assert.rejects(auditFourTrioSections(f),/changed identity/);
 assert.equal(f.mutations(),0);
});
