import {PDFDocument,PDFDict,PDFName,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import sharp from 'sharp';
import {inspectArchive,zipFiles,ETSY_FILE_MAX,ETSY_FILE_COUNT} from './digital-archive.mjs';
import {digest} from './product-metadata.mjs';

const topics={
 bsl:['BSL fingerspelling','BSL alphabet'],
 music:['music worksheets','music notation'],
 hand:['handwriting practice','word tracing'],
 math:['maths worksheets','number activities'],
 spell:['spelling practice','literacy activities'],
 maze:['kids mazes','maze puzzles'],
 color:['colouring pages','kids colouring']
};
const labels={bsl:'British Sign Language alphabet and fingerspelling',music:'music notation and exercises',hand:'handwriting',math:'maths',spell:'spelling and vocabulary',maze:'mazes',color:'colouring'};
const safe=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!/[\x00-\x1f<>]/.test(v);
export function bookDetails(plan){
 if(!safe(plan?.title,100)||typeof plan.age!=='string'||!/^\d{1,2}\s*[-–]\s*\d{1,2}$/.test(plan.age)||!Array.isArray(plan.pages)||!Array.isArray(plan.endMatter))throw Error('Book plan requires title, age range and numbered pages');
 const [a,b]=plan.age.split(/[-–]/).map(Number);
 if(a<2||b<a||b>18||b-a>5)throw Error('Invalid book age range');
 const numbers=[...plan.pages.map(p=>p.page),...plan.endMatter];
 if(numbers.length!==40||numbers.some((n,i)=>n!==i+1)||!plan.pages.length||plan.pages.some(p=>!safe(p.title,100)||!Object.hasOwn(topics,p.area)))throw Error('Expected 40 numbered interior pages with recognised activity types');
 const areas=[...new Set(plan.pages.map(p=>p.area))];
 const hasSearch=plan.pages.some(p=>/word search/i.test(p.title)||/word.?search/i.test(p.variant||''));
 const tags=['kids activity book','printable worksheets','ages '+a+' '+b,'age '+a+' '+b+' activities','home learning','screen free kids',...(hasSearch?['kids word search']:[]),...areas.map(k=>topics[k][0]),...areas.map(k=>topics[k][1]),'printable puzzles','learning activities','A4 printable','PDF activity book'];
 const unique=[...new Set(tags.map(t=>t.toLowerCase()))].filter(t=>t.length<=20).slice(0,13);
 if(unique.length!==13)throw Error('Unable to prepare 13 relevant tags');
 const age=a+'–'+b,subject='Ages '+age+' printable learning activities';
 const listingTitle='Printable Kids Activity Book Ages '+age+' – '+areas.slice(0,3).map(k=>({bsl:'BSL',music:'Music',hand:'Writing',math:'Maths',spell:'Spelling',maze:'Mazes',color:'Colouring'})[k]).join(', ')+' – 40 Pages, A4 PDF – '+plan.title;
 return {name:plan.title,subject,etsyTitle:listingTitle.length<=140?listingTitle:listingTitle.slice(0,listingTitle.lastIndexOf(' – ')),description:plan.title+' is a printable learning pack for ages '+age+'. Includes 40 numbered A4 interior pages plus the front cover. Activities cover '+areas.map(k=>labels[k]).join(', ')+(hasSearch?', including word searches':'')+'. Designed for screen-free learning at home. Created with AI assistance. This is not a complete curriculum or sign language course.',tags:unique,age,areas,hasSearch};
}
export async function inspectActivityBook(bytes){
 const outer=await inspectArchive(bytes,{allowBookPack:true});
 const plans=outer.files.filter(f=>f.name==='BOOK_PLAN.json');
 if(plans.length!==1)throw Error('Complete activity book ZIP requires BOOK_PLAN.json');
 const plan=JSON.parse(plans[0].data.toString('utf8')),details=bookDetails(plan);
 const outerEtsy=outer.files.filter(f=>/^Etsy\//.test(f.name));
 if(outer.files.some(f=>f!==plans[0]&&!outerEtsy.includes(f)))throw Error('Unexpected file outside Etsy edition');
 const nested=outerEtsy.filter(f=>f.format==='zip');
 if(nested.length>1||(nested.length&&outerEtsy.some(f=>f.format==='pdf')))throw Error('Ambiguous Etsy edition: supply PDF files or one Etsy ZIP');
 const files=nested.length?(await inspectArchive(nested[0].data)).files:outerEtsy.map(f=>({...f,name:f.name.slice(5)}));
 if(files.some(f=>f.name.includes('/')||!(f.format==='pdf'||f.name==='PRINTING_GUIDE.txt')))throw Error('Etsy edition may contain only printable PDFs and printing guide');
 const pdfs=files.filter(f=>f.format==='pdf').sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}));
 if(!pdfs.length||pdfs.reduce((n,p)=>n+p.pages,0)!==41||pdfs.some(p=>p.pagePoints.some(s=>Math.abs(s.width-595.276)>1||Math.abs(s.height-841.89)>1)))throw Error('Expected 41 A4 PDF pages: cover plus 40 interior pages');
 const packages=[];
 for(const pdf of pdfs){const data=await zipFiles([pdf]);if(data.length>ETSY_FILE_MAX)throw Error('Etsy PDF ZIP exceeds 20 MB: split the Etsy PDF in the generator');packages.push({name:pdf.name.replace(/\.pdf$/i,'.zip'),data,bytes:data.length,sha256:digest(data)});}
 if(packages.length>ETSY_FILE_COUNT)throw Error('Etsy permits up to five customer downloads');
 const guides=[...files,...outerEtsy].filter(f=>f.name.endsWith('PRINTING_GUIDE.txt'));
 const instructions=guides[0]?.data.toString('utf8').trim()||'Download and unzip the PDF, then print on A4 paper at actual size / 100%.';
 // Only actual PDF bytes determine new-product identity, never the reused outer filename.
 const sku='DG-BOOK-'+digest(pdfs.map(p=>p.sha256)).slice(0,24).toUpperCase();
 return {inspection:{...outer,files:pdfs},plan,details,delivery:{files:packages,contents:pdfs,split:packages.length>1},instructions,sku,pdfs};
}
async function pageImage(page){
 // Generator writes a single full-page JPEG. Reject other PDF layouts instead of
 // guessing, cropping, or using a different edition's cover.
 if(page.getRotation().angle!==0)throw Error('Unexpected PDF page rotation');
 const media=page.getMediaBox(),crop=page.getCropBox();
 if(media.x!==0||media.y!==0||crop.x!==0||crop.y!==0||Math.abs(media.width-crop.width)>.01||Math.abs(media.height-crop.height)>.01)throw Error('Unexpected PDF page crop');
 const content=page.node.Contents();
 if(!(content instanceof PDFRawStream))throw Error('Book page must contain a single full-page image stream');
 const commands=Buffer.from(decodePDFRawStream(content).decode()).toString('ascii').trim();
 const match=commands.match(/^q\s+([\d.]+)\s+0\s+0\s+([\d.]+)\s+0\s+0\s+cm\s+\/([A-Za-z0-9]+)\s+Do\s+Q$/);
 if(!match||Math.abs(Number(match[1])-page.getWidth())>.02||Math.abs(Number(match[2])-page.getHeight())>.02)throw Error('Book page is not a verified full-page image');
 const resources=page.node.Resources(),objects=resources?.lookup(PDFName.of('XObject'),PDFDict),stream=objects?.lookup(PDFName.of(match[3]));
 if(!(stream instanceof PDFRawStream)||stream.dict.get(PDFName.of('Subtype'))?.toString()!=='/Image'||stream.dict.get(PDFName.of('Filter'))?.toString()!=='/DCTDecode'||stream.dict.has(PDFName.of('SMask'))||stream.dict.has(PDFName.of('Mask'))||stream.dict.get(PDFName.of('ColorSpace'))?.toString()!=='/DeviceRGB')throw Error('Expected original full-page RGB JPEG');
 const image=sharp(Buffer.from(stream.getContents()),{limitInputPixels:100_000_000,failOn:'warning'}),m=await image.metadata();
 if(m.format!=='jpeg'||m.width<2000||m.height<2000||Math.abs(m.width/m.height-page.getWidth()/page.getHeight())>.005)throw Error('Book preview dimensions do not match the PDF');
 return image.jpeg({quality:95}).toBuffer();
}
export async function activityBookPreviews(book){
 const docs=await Promise.all(book.pdfs.map(p=>PDFDocument.load(p.data,{updateMetadata:false}))),pages=docs.flatMap(d=>d.getPages());
 const chosen=[],seen=new Set();
 for(const p of book.plan.pages){if(!seen.has(p.area)){chosen.push(p);seen.add(p.area);}if(chosen.length===3)break;}
 const images=[await pageImage(pages[0])],alts=['Front cover of '+book.details.name+', printable 40-page activity book for ages '+book.details.age+'.'];
 for(const p of chosen){images.push(await pageImage(pages[p.page]));alts.push('Sample interior page '+p.page+' from '+book.details.name+': '+p.title+' (ages '+book.details.age+').');}
 return {images,alts};
}
