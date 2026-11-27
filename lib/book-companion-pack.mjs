import {inspectArchive} from './digital-archive.mjs';
import {bookDetails} from './activity-book.mjs';
import {bookIdentity} from './book-companion-identity.mjs';
const expectedInterior='KDP/KDP_40_Page_Interior_A4.pdf',expectedCover='KDP/KDP_Full_Wrap_Cover.pdf';
const pageNames=[...Array.from({length:36},(_,i)=>i),39,40].map(i=>'Interactive/pages/'+String(i).padStart(2,'0')+'.jpg');
const inches=(v)=>v*72;
const matches=(p,w,h)=>Math.abs(p.width-inches(w))<0.15&&Math.abs(p.height-inches(h))<0.15;
export async function inspectCompanionPack(bytes){
 const archive=await inspectArchive(bytes,{allowBookPack:true,allowCompanionPack:true});
 const files=new Map(archive.files.map(f=>[f.name,f]));
 const requireFile=name=>{const file=files.get(name);if(!file)throw Error('Missing '+name);return file;};
 const manifest=requireFile('BOOK_PLAN.json'),plan=JSON.parse(manifest.data.toString('utf8')),details=bookDetails(plan);
 const interior=requireFile(expectedInterior),cover=requireFile(expectedCover),html=requireFile('Interactive/index.html');
 const print={trimWidth:8.27,trimHeight:11.69,pageCount:40,interiorBleed:false,coverBleed:0.125,spine:40*0.002347,coverWidth:2*8.27+40*0.002347+0.25,coverHeight:11.69+0.25};
 if(interior.pages!==40||!interior.pagePoints.every(p=>matches(p,print.trimWidth,print.trimHeight)))throw Error('Interior does not match 40-page A4 no-bleed profile');
 if(cover.pages!==1||!matches(cover.pagePoints[0],print.coverWidth,print.coverHeight))throw Error('Full-wrap dimensions do not match premium colour profile');
 const pages=pageNames.map(name=>requireFile(name));
 if(pages.some(f=>f.format!=='jpg'||!f.width||!f.height||Math.abs(f.width/f.height-2480/3508)>.02))throw Error('Invalid companion page image');
 const allowed=new Set(['BOOK_PLAN.json','START_HERE.txt',expectedInterior,expectedCover,'KDP/PRINT_SETTINGS.txt','Interactive/index.html','Interactive/READ_ME.txt',...pageNames]);
 if(archive.files.some(f=>!allowed.has(f.name)&&!/^Etsy\/[^/]+\.(pdf|zip|txt)$/i.test(f.name)))throw Error('Unexpected file in complete book pack');
 return {identity:bookIdentity(manifest.data,interior.data),details,print,interior,cover,html,pages};
}
