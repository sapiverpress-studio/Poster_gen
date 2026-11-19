// Owner-reviewed suggestions for a PHYSICAL Etsy poster, never merchant writes.
// Search demand/competition is unknown: image analysis describes visible content only.
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
const forbidden=/\b(?:bestseller|best seller|trending|viral|most popular|guaranteed sales)\b/i;
export function validPosterRequest(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid artwork request');
 const imageDataUrl=String(raw.imageDataUrl||'');
 if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)||imageDataUrl.length>800000)throw Error('Use a reduced JPEG artwork preview under 800 KB');
 const name=clean(raw.name).slice(0,100),subject=clean(raw.subject).slice(0,100);
 const kind=['artwork','educational','dinosaur'].includes(raw.kind)?raw.kind:'artwork';
 return {imageDataUrl,name,subject,kind};
}
export function validatePosterSeo(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Image analysis did not return listing details');
 const title=clean(raw.title);
 const tags=Array.isArray(raw.tags)?raw.tags.map(clean):[];
 const description=clean(raw.description);
 if(!title||title.length>140||!/\b(?:posters?|prints?|wall art)\b/i.test(title)||forbidden.test(title))throw Error('Etsy title must accurately identify a physical poster');
 if(tags.length!==13||tags.some(tag=>!tag||tag.length>20||/[<>\x00-\x1f]/.test(tag)||forbidden.test(tag))||new Set(tags.map(tag=>tag.toLowerCase())).size!==13)throw Error('Etsy needs 13 distinct truthful tags of at most 20 characters');
 if(!description||description.length>1600||!/(?:physical|printed|shipped)/i.test(description)||forbidden.test(description))throw Error('Description must clearly identify a physical printed product');
 if(/\b(?:instant download|digital download|downloadable file|printable file)\b/i.test(description)&&!/\bnot\s+(?:an?\s+)?(?:instant download|digital download|downloadable file|printable file)\b/i.test(description))throw Error('Physical descriptions must not promise downloadable files');
 return {title,tags,description,source:'visual-ai',live_search_volume:false,reviewRequired:true};
}
export async function suggestPosterSeo({imageDataUrl,name='',subject='',kind='artwork'},{apiKey,request=fetch}={}){
 const input=validPosterRequest({imageDataUrl,name,subject,kind});
 if(!apiKey)throw Error('Etsy artwork analysis is not configured; enter listing details manually');
 const messages=[
  {role:'system',content:[
   'Write accurate Etsy UK titles, 13 tags and descriptions for physical shipped art prints, not digital download files.',
   'Return one JSON object with title (string), tags (array of EXACTLY 13 unique strings each at most 20 characters), description (string).',
   'Use buyer-language multiword tags about clearly visible subject, style, relevant room or genuine gift interest. No keyword stuffing or repeated variants.',
   'Clearly identify a physical art print/poster in title and description. Keep title readable, preferably under 15 words and never over 140 characters.',
   'This is a PHYSICAL poster in A4 or A5 and can be ordered framed or unframed. Do not promise a digital file, free delivery, paper stock, archival ink or exact frame quality.',
   'Only state visually supported colours, subjects and themes. Do not invent specific text, intellectual property, location, age suitability or claims.',
   'Artwork creation method is unknown. Do not say the artwork was AI-generated; writing metadata with AI alone is not proof.',
   'Do not claim Etsy search volumes, rankings, popularity, demand or proven SEO performance. Use UK English.',
   'Return JSON only.'
  ].join(' ')},
  {role:'user',content:[{type:'text',text:'Artwork name: '+input.name+'; subject hint: '+input.subject+'; poster category: '+input.kind+'. Base everything factual on the visible image; text hints may be incomplete.'},{type:'image_url',image_url:{url:input.imageDataUrl,detail:'low'}}]}
 ];
 const response=await request('https://api.openai.com/v1/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
  body:JSON.stringify({model:'gpt-4o-mini',temperature:0.2,max_tokens:1100,response_format:{type:'json_object'},messages}),
  signal:AbortSignal.timeout(30000),redirect:'error'
 });
 if(!response.ok)throw Error('Image analysis provider unavailable');
 const payload=await response.json(),answer=payload?.choices?.[0]?.message?.content;
 if(typeof answer!=='string'||answer.length>10000)throw Error('Invalid image-analysis response');
 let parsed;try{parsed=JSON.parse(answer);}catch{throw Error('Image analysis did not return valid listing JSON');}
 return validatePosterSeo(parsed);
}
