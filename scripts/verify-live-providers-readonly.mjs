// Read-only authenticated provider checks; never log keys, prices, response bodies or customer data.
export async function verifyReadOnlyProviders(env,request=fetch){
 const result={printshrimp:{status:'NOT_TESTED',httpStatus:null,gbA4:false,gbA5:false},
 etsy:{status:'NOT_TESTED',httpStatus:null},merchantWrites:false,fulfilmentVerified:false};
 if(!env.SHRIMP_APIKEY?.trim())result.printshrimp.status='MISSING_SECRET';
 else try{
  const r=await request('https://api.printshrimp.com/functions/v1/api-get-pricing?country=GB',{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{'x-api-key':env.SHRIMP_APIKEY.trim(),Accept:'application/json'}});
  result.printshrimp.httpStatus=r.status;
  if(!r.ok)result.printshrimp.status=[401,403].includes(r.status)?'AUTH_REJECTED':'HTTP_ERROR';
  else {
   const p=await r.json();
   const valid=size=>p?.sizes?.some(x=>x.size===size&&Number.isFinite(x.print?.price)&&x.print.price>0&&Number.isFinite(x.print?.shipping)&&x.print.shipping>=0);
   result.printshrimp.gbA4=Boolean(valid('A4'));result.printshrimp.gbA5=Boolean(valid('A5'));
   result.printshrimp.status=p?.success===true&&p?.currency==='GBP'&&result.printshrimp.gbA4&&result.printshrimp.gbA5?'PRICING_SCHEMA_VERIFIED':'SCHEMA_MISMATCH';
  }
 }catch{result.printshrimp.status='NETWORK_OR_RESPONSE_ERROR';}
 if(!env.ETSY_PRINTS_KEYSTRING?.trim()||!env.ETSY_PRINTS_SHARED_SECRET?.trim())result.etsy.status='MISSING_SECRET';
 else try{
  const r=await request('https://api.etsy.com/v3/application/openapi-ping',{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{'x-api-key':env.ETSY_PRINTS_KEYSTRING.trim()+':'+env.ETSY_PRINTS_SHARED_SECRET.trim(),Accept:'application/json'}});
  result.etsy.httpStatus=r.status;
  result.etsy.status=r.ok?'APP_CREDENTIALS_VERIFIED':[401,403].includes(r.status)?'AUTH_REJECTED':'HTTP_ERROR';
  if(r.body)await r.body.cancel().catch(()=>{});
 }catch{result.etsy.status='NETWORK_ERROR';}
 return result;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const report=await verifyReadOnlyProviders(process.env);
 console.log('Provider preflight (no writes):',JSON.stringify(report));
 if(report.printshrimp.status!=='PRICING_SCHEMA_VERIFIED'||report.etsy.status!=='APP_CREDENTIALS_VERIFIED')process.exitCode=1;
}
