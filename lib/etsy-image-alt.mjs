// Etsy listing-image alt text is derived from reviewed product metadata.
// It does not call an AI service, change artwork, or promise visual details
// that are not established by the corresponding image-generation workflow.
// Etsy recommends concise, image-specific descriptions up to 250 characters.
export const ALT_TEXT_MAX=250;
const tidy=value=>String(value??'').replace(/[<>\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().replace(/[.!?,;:]+$/,'');
const short=value=>{const text=tidy(value);return text.length<=110?text:text.slice(0,110).replace(/\s+\S*$/,'').trim();};
const finish=value=>{
 const text=tidy(value);
 if(!text)throw Error('Listing image needs an identifiable subject for alt text');
 const limited=text.length<=ALT_TEXT_MAX-1?text:text.slice(0,ALT_TEXT_MAX-1).replace(/\s+\S*$/,'').trim();
 return limited+'.';
};

/**
 * Create one honest, distinct description for each listing photograph.
 * Physical photo order: clean unframed front, Black/White/Oak room mockups.
 * Trio photo order: clean composite, then three unframed member artworks.
 * Digital photo order: optional clean front, then retained package previews.
 */
export function listingImageAltTexts({type,title='',subject='',size='',memberNames=[],count,cleanLead=false,kind=''}={}){
 const name=short(subject||title);
 if(!name)throw Error('Listing image subject is required for alt text');
 if(type==='physical'){
  if(count!==4)throw Error('Physical listing must have four known image roles');
  return [
   finish('Full unframed front view of '+name+' art print, showing the complete artwork on a plain background'),
   finish(name+' art print shown in an illustrative black frame in a furnished room'),
   finish(name+' art print shown in an illustrative white frame in a furnished room'),
   finish(name+' art print shown in an illustrative oak frame in a furnished room')
  ];
 }
 if(type==='trio'){
  if(count!==4)throw Error('Trio listing must have a cover and three member previews');
  const collection=short(title||subject),format=tidy(size);
  return [
   finish('Front view of three separate '+(format?format+' ':'')+'art prints arranged together for '+collection+', with no frames or room props'),
   ...[0,1,2].map(i=>finish('Unframed close-up of '+short(memberNames[i]||'artwork '+(i+1))+' from the '+collection+' trio on a pale background'))
  ];
 }
 if(type==='digital'){
  if(!Number.isInteger(count)||count<1||count>10)throw Error('Digital listing image count is invalid');
  const medium=kind==='pattern'?'digital pattern':kind==='poster'?'digital printable poster':'digital design';
  return Array.from({length:count},(_,i)=>finish(i===0&&cleanLead
   ?'Full front view of '+name+' '+medium+' artwork on a plain background'
   :'Listing preview '+(i+1)+' of '+count+' for '+name+' '+medium+' download'));
 }
 throw Error('Unsupported listing image type');
}
