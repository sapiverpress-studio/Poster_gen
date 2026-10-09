// Read-only preflight. Never log headers, response bodies, or credential values.
import { pathToFileURL } from 'node:url';
export const SECRET_NAMES = Object.freeze(['ETSY_PRINTS_KEYSTRING','ETSY_PRINTS_SHARED_SECRET','SHRIMP_APIKEY']);
export async function checkProviderAccess(env, request=fetch) {
  const present=Object.fromEntries(SECRET_NAMES.map(name=>[name,Boolean(env[name]?.trim())]));
  const report={secrets:present,etsy:{appAccess:'NOT_TESTED',sellerAccess:'NOT_CONFIGURED'},printshrimp:{access:'NOT_TESTED',reason:'Authenticated API specification required; no guessed requests'},publicationEnabled:false,ordersEnabled:false};
  if(present.SHRIMP_APIKEY) {
    try {
      const response=await request('https://api.printshrimp.com/functions/v1/api-get-pricing',{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'x-api-key':env.SHRIMP_APIKEY.trim(),Accept:'application/json'}});
      report.printshrimp.httpStatus=response.status;report.printshrimp.access=response.ok?'VERIFIED':'REJECTED';delete report.printshrimp.reason;
      if(response.body)await response.body.cancel();
    }catch {report.printshrimp.access='NETWORK_ERROR';}
  }
  if(!present.ETSY_PRINTS_KEYSTRING || !present.ETSY_PRINTS_SHARED_SECRET) return report;
  try {
    const response=await request('https://api.etsy.com/v3/application/openapi-ping', {
      method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{'x-api-key':env.ETSY_PRINTS_KEYSTRING.trim()+':'+env.ETSY_PRINTS_SHARED_SECRET.trim(),'Accept':'application/json'}
    });
    report.etsy.httpStatus=response.status;
    report.etsy.appAccess=response.ok?'VERIFIED':'REJECTED';
    // Do not print body: providers can echo credentials in diagnostics.
    if(response.body) await response.body.cancel();
  }catch {report.etsy.appAccess='NETWORK_ERROR';}
  return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const report=await checkProviderAccess(process.env);
  console.log(JSON.stringify(report,null,2));
  if(Object.values(report.secrets).some(p=>!p)||report.etsy.appAccess!=='VERIFIED'||report.printshrimp.access!=='VERIFIED') process.exitCode=1;
}
