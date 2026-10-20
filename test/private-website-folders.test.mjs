import test from 'node:test';
import assert from 'node:assert/strict';
import {folderCatalogue} from '../lib/catalogue-folders.mjs';
import {bulkCollectionBody} from '../lib/product-web.mjs';

const time=Date.parse('2026-10-19T04:30:00Z');
const own='s'.repeat(32);
const stored=[{productId:own,phase:'stored',storeOnly:true,metadata:{name:'Christmas Owl',websiteFolder:'Winter Woodland',sectionTitle:'Nature'}}];
const audit={version:1,shopId:456,checkedAt:time,sections:[{id:12,title:'Nature'}],summary:{physicalTotal:1,activePhysical:1},listings:[{id:321,title:'Listed Robin',section:'Nature',sectionId:12,state:'active'}]};
test('a private website folder only shows stored posters and never unrelated Etsy listings',()=>{
 const props={audit,status:{phase:'available'},folders:['Winter Woodland'],stored,clock:()=>time};
 const privateHtml=folderCatalogue({...props,folder:'Winter Woodland'});
 assert.match(privateHtml,/Christmas Owl/);
 assert.match(privateHtml,/First ON → Review/);
 assert.doesNotMatch(privateHtml,/Listed Robin/);
 assert.doesNotMatch(privateHtml,/poster-toggle/);
 const etsyHtml=folderCatalogue({...props,section:'Nature'});
 assert.match(etsyHtml,/Listed Robin/);
 assert.match(etsyHtml,/Christmas Owl/);
});
test('six-poster bulk uploader offers local private folders without changing Etsy sections',()=>{
 const html=bulkCollectionBody({monthly:{used:52,remaining:0,limit:52,label:'October 2026'},sectionInfo:{sections:[{id:12,title:'Nature'}]},websiteFolders:['Winter Woodland','Spring Garden']});
 assert.match(html,/<select name="websiteFolder">/);
 assert.match(html,/<option value="Winter Woodland">Winter Woodland<\/option>/);
 assert.match(html,/<option value="Nature">Nature<\/option>/);
 assert.match(html,/name="storeOnly" type="checkbox"/);
 assert.doesNotMatch(html,/name="storeOnly" type="checkbox" checked/);
 assert.match(html,/ZIP size determines whether the collection fits/);
});
