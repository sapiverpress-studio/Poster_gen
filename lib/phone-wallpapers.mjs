import sharp from 'sharp';

export const WALLPAPER_COUNT=5,WALLPAPER_WIDTH=1440,WALLPAPER_HEIGHT=3200;
const imageFormats=new Set(['png','jpg','jpeg']);

// The archive validator has already decoded and checked these files. Names are
// deliberately unrestricted beyond its existing safe-path rules; buyer bytes stay intact.
export function validatePhoneWallpapers(files){
 const images=files.filter(f=>imageFormats.has(f.format));
 if(images.length!==WALLPAPER_COUNT)throw Error('A phone wallpaper bundle needs exactly five JPG or PNG images. Listing previews belong outside the buyer ZIP.');
 if(files.some(f=>!imageFormats.has(f.format)&&!['txt','md','json','pdf'].includes(f.format)))throw Error('Wallpaper buyer ZIPs may contain the five images and customer documents only.');
 for(const file of images){
  if(file.orientation>=5||file.width<WALLPAPER_WIDTH||file.height<WALLPAPER_HEIGHT||file.width>=file.height)
   throw Error('Each phone wallpaper must be portrait and at least 1440 × 3200 pixels: '+file.name);
 }
 if(new Set(images.map(f=>f.sha256)).size!==WALLPAPER_COUNT)throw Error('Include five different wallpaper images; identical copies were found.');
 return images;
}

const label=(title,subtitle)=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">'+
 '<text x="1000" y="180" text-anchor="middle" font-family="sans-serif" font-size="78" fill="#213333">'+title+'</text>'+
 '<text x="1000" y="1870" text-anchor="middle" font-family="sans-serif" font-size="38" fill="#213333">'+subtitle+'</text></svg>');
async function phone(file,width,height){
 const border=18,back=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+(width+border*2)+'" height="'+(height+border*2)+'"><rect width="100%" height="100%" rx="45" fill="#213333"/></svg>');
 const image=await sharp(file.data).rotate().resize(width,height,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).png().toBuffer();
 return sharp(back).composite([{input:image,left:border,top:border}]).png().toBuffer();
}
async function canvas(layers,title,subtitle){
 return sharp({create:{width:2000,height:2000,channels:3,background:'#f7f3ec'}})
  .composite([...layers,{input:label(title,subtitle),left:0,top:0}]).jpeg({quality:92}).toBuffer();
}
export async function phoneWallpaperPreviews(images){
 const layers=[];
 for(let i=0;i<images.length;i++)layers.push({input:await phone(images[i],310,689),left:77+i*375,top:610});
 const previews=[await canvas(layers,'5 phone wallpapers','Digital download · Five designs · No physical item')];
 for(let i=0;i<images.length;i++)previews.push(await canvas([
  {input:await phone(images[i],640,1422),left:662,top:280}
 ],'Wallpaper '+(i+1)+' of 5','Illustrative phone frame · Cropping varies by device'));
 return previews;
}

export function phoneWallpaperAltTexts(subject){
 const name=String(subject).replace(/[<>\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
 return ['Overview of all five '+name+' phone wallpaper designs, displayed side by side in illustrative phone frames.',
  ...Array.from({length:5},(_,i)=>'Design '+(i+1)+' of five from the '+name+' phone wallpaper bundle, shown in an illustrative phone frame with the complete image visible.')];
}
