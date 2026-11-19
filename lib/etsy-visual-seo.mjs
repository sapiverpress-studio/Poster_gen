// Owner-reviewed suggestions for a PHYSICAL Etsy poster, never merchant writes.
// Search demand/competition is unknown: image analysis describes visible content only.
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
const forbidden=/\b(?:bestseller|best seller|trending|viral|most popular|guaranteed sales)\b/i;

const validationFailure=(code,message)=>Object.assign(new Error(message),{seoCode:code,retryable:true});
const responseFailure=(code,message,retryable=false)=>Object.assign(new Error(message),{seoCode:code,retryable});
const safeReasons=Object.freeze({
  response_shape:'AI returned an incomplete response',
  invalid_json:'AI returned unreadable JSON',
  output_truncated:'AI wording was cut off',
  refusal:'AI could not describe this artwork',
  title:'the proposed title did not meet physical Etsy listing rules',
  tags:'the 13 Etsy tags were invalid, repeated or too long',
  digital_tags:'physical print tags incorrectly described a digital file',
  description:'the description did not accurately identify the physical product',
  alt_text:'the accessible image description is missing or too long',
  trio:'the three-print title, count or fixed size was not identified correctly',
  physical:'the description incorrectly said no printed product is shipped',
  digital_description:'the description incorrectly promised a download',
  provider:'the AI provider could not complete the request',
  provider_format:'the AI service did not accept its response-format request',
  internal:'the image-analysis result could not be processed'
});
// Only fixed, non-sensitive rule names are exposed. Never return an AI draft, picture, credentials or provider error.
export function publicPosterSeoIssue(error){
 const code=Object.hasOwn(safeReasons,error?.seoCode)?error.seoCode:'internal';
 return {code,message:safeReasons[code]};
}
const OUTPUT_SCHEMA={
 type:'object',additionalProperties:false,properties:{
  title:{type:'string'},
  tags:{type:'array',items:{type:'string'}},
  description:{type:'string'},
  altText:{type:'string'}
 },required:['title','tags','description','altText']
};

export function validPosterRequest(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid artwork request');
 const kind=['artwork','educational','dinosaur','trio'].includes(raw.kind)?raw.kind:'artwork';
 const imageDataUrls=kind==='trio'?raw.imageDataUrls:[raw.imageDataUrl];
 if(!Array.isArray(imageDataUrls)||imageDataUrls.length!==(kind==='trio'?3:1)||
    imageDataUrls.some(u=>typeof u!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(u)||u.length>(kind==='trio'?260000:800000))||
    imageDataUrls.reduce((sum,u)=>sum+u.length,0)>800000)
    throw Error('Use '+(kind==='trio'?'three reduced JPEG artwork previews':'a reduced JPEG artwork preview')+' under 800 KB total');
 const name=clean(raw.name).slice(0,100),subject=clean(raw.subject).slice(0,150),size=['A4','A5'].includes(raw.size)?raw.size:'';
 return {imageDataUrl:imageDataUrls[0],imageDataUrls,name,subject,kind,size};
}
export function validatePosterSeo(raw,{kind='artwork',size=''}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw validationFailure('response_shape','Image analysis did not return listing details');
 const title=clean(raw.title);
 const tags=Array.isArray(raw.tags)?raw.tags.map(clean):[];
 const description=clean(raw.description);
 const altText=clean(raw.altText);
 if(!title||title.length>140||!/\b(?:posters?|prints?|wall art)\b/i.test(title)||forbidden.test(title))throw validationFailure('title','Etsy title must accurately identify a physical poster');
 if(tags.length!==13||tags.some(tag=>!tag||tag.length>20||/[<>\x00-\x1f]/.test(tag)||forbidden.test(tag))||new Set(tags.map(tag=>tag.toLowerCase())).size!==13)throw validationFailure('tags','Etsy needs 13 distinct truthful tags of at most 20 characters');
 if(tags.some(tag=>/\b(?:digital|download|printable|svg|pdf file|png file)\b/i.test(tag)))throw validationFailure('digital_tags','Physical Etsy tags must not promise a digital download');
 if(!description||description.length>1600||!/(?:physical|printed|shipped)/i.test(description)||forbidden.test(description))throw validationFailure('description','Description must clearly identify a physical printed product');
 if(!altText||altText.length>250||/[<>\x00-\x1f]/.test(altText)||forbidden.test(altText))throw validationFailure('alt_text','Alt text must describe the actual artwork in no more than 250 characters');
 if(kind==='trio'&&(!/\b(?:trio|set|collection|bundle)\b/i.test(title)||!/\b(?:three|3)\b/i.test(description)||size&&!description.includes(size)))
   throw validationFailure('trio','Trio listing must describe a physical set of three prints at its fixed size');
 if(/\b(?:no physical (?:item|product)|nothing (?:is )?shipped)\b/i.test(description))throw validationFailure('physical','Physical Etsy descriptions must say a printed product is delivered');
 if(/\b(?:instant download|digital download|downloadable file|printable file)\b/i.test(description)&&!/\bnot\s+(?:an?\s+)?(?:instant download|digital download|downloadable file|printable file)\b/i.test(description))throw validationFailure('digital_description','Physical descriptions must not promise downloadable files');
 return {title,tags,description,altText,source:'visual-ai',live_search_volume:false,reviewRequired:true};
}
export async function suggestPosterSeo({imageDataUrl,imageDataUrls,name='',subject='',kind='artwork',size=''},{apiKey,baseUrl='https://api.openai.com/v1',request=fetch}={}){
 const input=validPosterRequest({imageDataUrl,imageDataUrls,name,subject,kind,size});
 if(!apiKey)throw Error('Etsy artwork analysis is not configured; enter listing details manually');
 const messages=[
  {role:'system',content:[
   'Write accurate Etsy UK titles, 13 tags and descriptions for physical shipped art prints, not digital download files.',
   'Return one JSON object with title (string), tags (array of EXACTLY 13 unique strings each at most 20 characters), description (string), altText (string up to 250 characters).',
   'Use buyer-language multiword tags about clearly visible subject, style, relevant room or genuine gift interest. No keyword stuffing or repeated variants.',
   'Clearly identify a physical art print/poster in title and description. Keep title readable, preferably under 15 words and never over 140 characters.',
   input.kind==='trio'
    ?'The THREE supplied images are three DIFFERENT physical art prints sold together in ONE trio set at fixed size '+input.size+'. Title MUST say physical print/poster and trio/set/collection; description MUST say three separate physical prints and '+input.size+'. Do not invent frame options, material, size, price, licences or delivery promises.'
    :'This is a PHYSICAL poster in A4 or A5 and can be ordered framed or unframed. Do not promise a digital file, free delivery, paper stock, archival ink or exact frame quality.',
   'Only state visually supported colours, subjects and themes. Do not invent specific text, intellectual property, location, age suitability or claims.',
   'altText is for a blind or low-vision person to understand the supplied image: describe the visible subject, placement, colours and important details without sales pitches, keyword stuffing, frames, mockup scenes or claims. For a trio, describe the three separate designs. Keep it concise and under 250 characters.',
   'Artwork creation method is unknown. Do not say the artwork was AI-generated; writing metadata with AI alone is not proof.',
   'Do not claim Etsy search volumes, rankings, popularity, demand or proven SEO performance. Use UK English.',
   'Return JSON only.'
  ].join(' ')},
  {role:'user',content:[{type:'text',text:'Artwork name: '+input.name+'; subject hint: '+input.subject+'; poster category: '+input.kind+'; fixed size: '+input.size+'. Describe only the visible images and this verified product type; text hints may be incomplete.'},...input.imageDataUrls.map(url=>({type:'image_url',image_url:{url,detail:'low'}}))]}
 ];
 const base=String(baseUrl).replace(/\/+$/,'');
 if(base!=='https://api.openai.com/v1')throw Error('Direct OpenAI endpoint required; Netlify AI Gateway is not permitted');
 let format='json_schema',reason=null;
 // Two bounded attempts maximum. The existing UI's 35 s timeout is preserved.
 for(let attempt=0;attempt<2;attempt++){
  const correction=reason?[{role:'system',content:'The prior response failed this validation: '+publicPosterSeoIssue(reason).message+'. Regenerate accurate wording. Exactly thirteen DISTINCT tags (each 20 characters maximum), a clearly PHYSICAL print title and description, an accurate altText under 250 characters, and no unsupported promises. Output only the required fields.'}]:[];
  let response;
  try{
   response=await request(base+'/chat/completions',{
    method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({model:'gpt-4o-mini',temperature:0.2,max_tokens:1500,
     response_format:format==='json_schema'
      ?{type:'json_schema',json_schema:{name:'etsy_print_listing',strict:true,schema:OUTPUT_SCHEMA}}
      :{type:'json_object'},
     messages:[...messages,...correction]}),
    signal:AbortSignal.timeout(14500),redirect:'error'
   });
  }catch(error){
   if(String(error?.message||'').startsWith('Monthly Etsy AI request limit reached'))throw error;
   throw responseFailure('provider','Image analysis provider unavailable');
  }
  if(!response.ok){
   // A provider that has not enabled structured output can still use the existing JSON mode.
   if(attempt===0&&format==='json_schema'&&[400,422].includes(response.status)){
    reason=responseFailure('provider_format','Structured output unsupported',true);format='json_object';continue;
   }
   throw responseFailure(response.status===400||response.status===422?'provider_format':'provider','Image analysis provider unavailable');
  }
  let payload;
  try{payload=await response.json();}catch{reason=responseFailure('response_shape','AI returned a malformed API response',true);}
  if(!reason||!reason.retryable||payload){
   if(!payload)reason=responseFailure('response_shape','AI returned a malformed API response',true);
   else{
    const choice=payload?.choices?.[0],answer=choice?.message?.content;
    if(choice?.message?.refusal||choice?.finish_reason==='content_filter')
     throw responseFailure('refusal','AI declined the listing analysis');
    if(choice?.finish_reason==='length')reason=responseFailure('output_truncated','AI returned incomplete wording',true);
    else if(typeof answer!=='string'||answer.length>10000)reason=responseFailure('response_shape','AI returned an incomplete response',true);
    else{
     let parsed;
     try{parsed=JSON.parse(answer);}catch{reason=responseFailure('invalid_json','AI returned invalid JSON',true);}
     if(parsed){
      try{return validatePosterSeo(parsed,{kind:input.kind,size:input.size});}
      catch(error){reason=error;}
     }
    }
   }
  }
  if(!reason?.retryable)throw responseFailure('internal','AI analysis failed');
  if(attempt===1)throw reason;
 }
 throw reason||responseFailure('internal','AI analysis failed');
}
