import sharp from 'sharp';
// Product illustrations use actual uploaded artwork. Never crop or redraw it.
export async function makePosterMockups(bytes) {
 const input=sharp(bytes,{limitInputPixels:100_000_000,failOn:'warning'});
 const meta=await input.metadata();if(meta.format!=='png'||(meta.pages||1)!==1)throw Error('One PNG page required');
 const art=await input.resize(720,1018,{fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).png().toBuffer();
 const out=[];
 for(const color of ['#f7f1e7','#262626','#c39c6c']) {
  const frame=await sharp({create:{width:768,height:1066,channels:3,background:color}}).composite([{input:art,left:24,top:24}]).png().toBuffer();
  const caption=Buffer.from('<svg width="1200" height="100"><rect width="1200" height="100" fill="#eee9e1"/><text x="600" y="55" text-anchor="middle" font-family="sans-serif" font-size="25" fill="#444">Illustrative mockup • frame appearance may vary</text></svg>');
  out.push(await sharp({create:{width:1200,height:1400,channels:3,background:'#eee9e1'}}).composite([{input:frame,left:216,top:115},{input:caption,left:0,top:1300}]).jpeg({quality:90}).toBuffer());
 }
 return out;
}
