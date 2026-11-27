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
// Use the manifest rather than a fixed, first-13 list.
const themeProfiles=[
 ['christmas',/\b(christmas|xmas|santa|festive)\b/i],
 ['easter',/\beaster\b/i],['halloween',/\bhalloween\b/i],
 ['summer',/\bsummer\b/i],['winter',/\bwinter\b/i],
 ['spring',/\bspring\b/i],['autumn',/\b(autumn|fall)\b/i],
 ['dinosaur',/\b(dinosaurs?|jurassic|prehistoric)\b/i],
 ['space',/\b(space|planets?|rockets?|astronauts?|galaxy|solar system)\b/i],
 ['ocean',/\b(ocean|underwater|under the sea|marine)\b/i],
 ['woodland',/\b(woodland|forest)\b/i],['nature',/\b(nature|garden|wildlife)\b/i],
 ['transport',/\b(transport|vehicles?|trains?|railway|cars?|trucks?)\b/i],
 ['farm',/\b(farm|farmyard)\b/i],['animal',/\b(animals?|zoo|pets?)\b/i],
 ['pirate',/\bpirates?\b/i],['unicorn',/\bunicorns?\b/i],['weather',/\bweather\b/i]
];
function learningTheme(plan){
 const title=plan.title.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'");
 const explicit=plan.pages.map(p=>String(p.theme||'').toLowerCase());
 const profile=themeProfiles.find(([key,rx])=>rx.test(title)||explicit.includes(key));
 if(profile)return profile[0];
 const phrase=title.replace(/\bhen\s*(?:&|and)\s*bea(?:'s|s)?\b/g,' ')
   .replace(/\b(?:ages?|for|the|a|an|of|and|big|my|our|little|fun|learning|activity|activities|book|books|pack|adventure|adventures|printable|educational|kids|children|worksheets?|workbook|general|edition|pdf|a4)\b/g,' ')
   .replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
 return phrase.length>=3&&phrase.length<=12&&phrase.split(' ').length<=2?phrase:'';
}
function activityTags(plan,areas,a,b,hasSearch){
 const name=learningTheme(plan),exists=area=>areas.includes(area);
 const variant=(area,re)=>plan.pages.some(p=>p.area===area&&re.test(String(p.variant||'')+' '+p.title));
 const subjectOrder=['math','bsl','music','spell','hand','maze','color'].filter(exists);
 const subjects=subjectOrder.map(k=>k==='music'&&!variant('music',/note-name|note-missing|notes and beats|name the note|missing note/i)?'music notation':topics[k][0]);
 const activities=[
  ...(hasSearch?[name&&name.length<=8?name+' word search':name&&name.length<=9?name+' wordsearch':'kids word search']:[]),
  ...(exists('hand')?['handwriting practice']:[]),
  ...(exists('maze')?['kids mazes']:[]),
  ...(exists('color')?[name&&name.length<=10?name+' colouring':'colouring pages']:[]),
  ...(exists('spell')?['spelling practice']:[]),
  ...(variant('math',/\bcount(?:ing)?\b/)?['counting activities']:[]),
  ...(variant('math',/\badd(?:ition)?\b/)?['addition worksheets']:[]),
  ...(variant('hand',/\btrace|tracing\b/)?['word tracing']:[]),
  ...(exists('music')?['music notation']:[]),
  ...(exists('bsl')?['bsl alphabet']:[])
 ];
 const puzzle=exists('maze')||hasSearch||variant('spell',/jumble|decode|missing/);
 const themeTags=name?[name+' activities',name+' printable',name==='christmas'?'christmas holiday':name+(puzzle?' puzzles':' activity book')]:[];
 const broad=['kids activities','holiday activities','screen free kids','home learning','printable worksheets','kids activity book','rainy day activities','quiet time activities','learning activities','kids printable','printable learning','a4 activity book','pdf activity book'];
 const out=[],seen=new Set();
 function add(candidates,limit=Infinity){
   let added=0;
   for(const candidate of candidates){
     const t=String(candidate||'').toLowerCase().replace(/\s+/g,' ').trim();
     if(!t||t.length>20||seen.has(t)||out.length>=13||added>=limit)continue;
     out.push(t);seen.add(t);added++;
   }
 }
 add(['ages '+a+' '+b],1);add(themeTags,3);add(subjects,3);add(activities,3);add(broad,3);
 // Reallocate unfilled slots only to present subject areas and valid buyer intents.
 add([...areas].sort((x,y)=>plan.pages.filter(p=>p.area===y).length-plan.pages.filter(p=>p.area===x).length).flatMap(k=>topics[k]));
 add(activities);add(broad);
 if(out.length!==13)throw Error('Unable to prepare 13 relevant tags');
 return out;
}
export function bookDetails(plan){
 if(!safe(plan?.title,100)||typeof plan.age!=='string'||!/^\d{1,2}\s*[-–]\s*\d{1,2}$/.test(plan.age)||!Array.isArray(plan.pages)||!Array.isArray(plan.endMatter))throw Error('Book plan requires title, age range and numbered pages');
 const [a,b]=plan.age.split(/[-–]/).map(Number);
 if(a<2||b<a||b>18||b-a>5)throw Error('Invalid book age range');
 const numbers=[...plan.pages.map(p=>p.page),...plan.endMatter];
 if(numbers.length!==40||numbers.some((n,i)=>n!==i+1)||!plan.pages.length||plan.pages.some(p=>!safe(p.title,100)||!Object.hasOwn(topics,p.area)))throw Error('Expected 40 numbered interior pages with recognised activity types');
 const areas=[...new Set(plan.pages.map(p=>p.area))];
 const hasSearch=plan.pages.some(p=>p.area==='spell'&&(/word search/i.test(p.title)||/^(?:search|word.?search)$/i.test(p.variant||'')));
 const unique=activityTags(plan,areas,a,b,hasSearch);
 const age=a+'–'+b,subject='Ages '+age+' printable learning activities';
 const listingTitle='Printable Kids Activity Book Ages '+age+' – '+['math','spell','music','bsl','hand','maze','color'].filter(k=>areas.includes(k)).slice(0,4).map(k=>({bsl:'BSL',music:'Music',hand:'Writing',math:'Maths',spell:'Spelling',maze:'Mazes',color:'Colouring'})[k]).join(', ')+' – 40 Pages, A4 PDF – '+plan.title;
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
 const guide=guides[0]?.data.toString('utf8')||'';
 const instructions='Download and unzip the PDF, then print on A4 paper at actual size / 100%. The first PDF page is the front cover, followed by 40 numbered interior pages.'+(/Solutions are interior pages 36[–-]38/i.test(guide)?' Solutions are on interior pages 36–38.':'');
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
 for(const area of ['math','music','bsl','spell','hand','maze','color']){const p=book.plan.pages.find(p=>p.area===area);if(p&&!seen.has(p.area)){chosen.push(p);seen.add(p.area);}if(chosen.length===3)break;}
 const images=[await pageImage(pages[0])],alts=['Front cover of '+book.details.name+', printable 40-page activity book for ages '+book.details.age+'.'];
 for(const p of chosen){images.push(await pageImage(pages[p.page]));alts.push('Sample interior page '+p.page+' from '+book.details.name+': '+p.title+' (ages '+book.details.age+').');}
 return {images,alts};
}
