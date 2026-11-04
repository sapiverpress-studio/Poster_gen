// Framed three-print Etsy listings: one supplier bundle SKU, four *set*
// finishes. Every choice applies to all three prints, never a mixed set.
// PrintShrimp 2026-10-18 bundle docs confirm Frame+Black/White/Oak on a
// bundle order; frames are NOT discounted by the supplier.
import {normalizeFrame,normalizeSize,FRAMES} from './poster-template.mjs';

const BAD=message=>{throw Error(message);};
const round=x=>Math.round(x*100)/100;
const priceOf=o=>o?.price?.currency_code==='GBP'&&Number.isFinite(o.price.amount)&&Number.isFinite(o.price.divisor)&&o.price.divisor>0?
 o.price.amount/o.price.divisor:Number.isFinite(o?.price)&&o.price>0?o.price:null;

export function verifiedFramedPrices(inventory,{size,sku}){
 if(!['A4','A5','A3'].includes(size)||!sku)BAD('Trio finish price needs one size and SKU');
 const result={};
 for(const finish of FRAMES){
  const matching=(inventory?.products||[]).filter(p=>{
   if(p.is_deleted||p.sku!==sku||!Array.isArray(p.property_values))return false;
   return p.property_values.some(x=>x.values?.some(v=>normalizeSize(v)===size))&&
    p.property_values.some(x=>x.values?.some(v=>normalizeFrame(v)===finish));
  });
  if(matching.length!==1)BAD('Trio source has no unambiguous '+size+' '+finish+' Etsy offering for '+sku);
  const offering=(matching[0].offerings||[]).filter(o=>o.is_enabled===true&&!o.is_deleted);
  if(offering.length!==1)BAD('Trio source has ambiguous Etsy '+finish+' offering');
  const price=priceOf(offering[0]);
  if(!(price>0))BAD('Trio source '+finish+' GBP price unverified');
  result[finish]=round(price);
 }
 return result;
}

export function quoteFramedTrio({pricing,size,memberPrices,discount,basePrintQuote,minimumContribution=6}){
 if(!['A4','A5','A3'].includes(size)||!Array.isArray(memberPrices)||memberPrices.length!==3||
    ![0,10,15].includes(discount)||!basePrintQuote||basePrintQuote.size!==size||
    !Number.isFinite(basePrintQuote.grossGbp))BAD('Unverified framed trio inputs');
 if(pricing?.success!==true||pricing.currency!=='GBP'||!Array.isArray(pricing.sizes))
  BAD('Supplier UK frame prices unavailable');
 const frame=pricing.sizes.find(x=>x.size===size)?.frame;
 if(!frame||!Number.isFinite(frame.price)||frame.price<=0||
    !Number.isFinite(frame.shipping)||frame.shipping<0)
  BAD('PrintShrimp does not quote framed '+size+' bundles for UK');
 const printTotal=memberPrices.reduce((sum,m)=>sum+m['Print Only'],0);
 if(memberPrices.some(m=>FRAMES.some(f=>!Number.isFinite(m[f])||m[f]<=0)))
  BAD('All four frame options require verified member prices');
 const savings=round(printTotal-basePrintQuote.grossGbp);
 if(savings<0||savings>printTotal*0.2+0.02)BAD('Unexpected three-print discount');
 const options={};
 for(const finish of FRAMES){
  const gross=finish==='Print Only'?basePrintQuote.grossGbp:
   round(memberPrices.reduce((sum,m)=>sum+m[finish],0)-savings);
  const supplierCost=finish==='Print Only'?basePrintQuote.supplierCostGbp:
   round(frame.price*3+frame.shipping);
  const fees=round(gross*0.15+0.50);
  const contribution=round(gross-supplierCost-fees);
  if(contribution<minimumContribution)BAD(finish+' bundle margin below £'+minimumContribution.toFixed(2)+'. Refuse publication.');
  options[finish]={grossGbp:gross,supplierCostGbp:supplierCost,
   estimatedFeesGbp:fees,contributionGbp:contribution};
 }
 return {size,discount,savingsGbp:savings,variants:options,
  notes:'Print Only uses supplier 3+ print discount. Framed sets use three full-price frames; the customer discount applies only to the original print component. All three items share one frame finish.'};
}

// Reference member has the existing Etsy frame/size property IDs. Reuse the
// verified same-size profile; keep the bundle SKU identical across finishes.
// Never invent a variation property ID or create an unchecked finish.
export function framedTrioInventory({size,sku,referencePlan,options,readinessStateId}){
 if(!sku||!referencePlan?.inventory?.products||!options?.variants||
    !Number.isSafeInteger(readinessStateId)||readinessStateId<1)
  BAD('Reference frame variation properties unavailable');
 const products=[],ids=new Set();
 for(const finish of FRAMES){
  const matches=referencePlan.inventory.products.filter(p=>
   p.property_values?.length===2&&
   p.property_values.some(x=>x.values?.some(v=>normalizeSize(v)===size))&&
   p.property_values.some(x=>x.values?.some(v=>normalizeFrame(v)===finish)));
  if(matches.length!==1||!options.variants[finish])BAD('Missing approved template '+size+' '+finish);
  const props=matches[0].property_values.map(x=>structuredClone(x));
  const f=props.find(x=>x.values.some(v=>normalizeFrame(v)===finish));
  if(!Number.isSafeInteger(f.property_id)||f.property_id<=0)BAD('Etsy frame property ID is invalid');
  ids.add(f.property_id);
  products.push({sku,property_values:props,offerings:[{
   price:options.variants[finish].grossGbp,quantity:10,
   is_enabled:true,readiness_state_id:readinessStateId
  }]});
 }
 if(ids.size!==1)BAD('Etsy frame IDs differ across variations');
 return {products,price_on_property:[...ids],quantity_on_property:[...ids],
  sku_on_property:[],readiness_state_on_property:[]};
}

export function framedTrioDescription(description,size){
 if(typeof description!=='string'||description.length<100||!['A4','A5','A3'].includes(size))
  BAD('Trio description missing');
 const cleaned=description
  .replace(/\bthree unframed ([Aa][345]) (portrait )?prints\b/gi,'three $1 $2prints')
  .replace(/, not digital files and not frames/gi,', not digital files')
  .replace(/\bunframed options\b/gi,'print and frame options')
  .replace(/\bnot frames\b/gi,'with your selected finish')
  .replace(/\bthree separate unframed prints\b/gi,'three separate prints')
  .replace(/\bthree unframed prints\b/gi,'three prints')
  .replace(/\bframes? are not (?:supplied|included)\.?/gi,'')
  .replace(/\bframes? (?:shown|pictured) for (?:display|illustration) only\.?/gi,'')
  .replace(/\bframes not included\.?/gi,'');
 if(/\b(?:unframed only|prints only|no frames|no frame|no framing|without frames|not framed|frames? (?:are|is) not (?:supplied|included)|frames? (?:are|is) (?:excluded|unavailable)|framing is not included)\b/i.test(cleaned))
  BAD('Trio description explicitly excludes frames. Update bundle.md before offering framed choices');
 const finishInfo='Finish choices: Print Only (three unframed paper prints) or Black Frame, White Frame or Oak Frame (three individually framed prints with matching frames). All three designs are '+size+' portrait prints. The entire set uses the one selected finish; frames are not mixed. This is a physical product, not a digital download.';
 return cleaned.trim()+'\n\n'+finishInfo;
}
