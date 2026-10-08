// Low-cost approved-design export worker. Does not run on branch deploys.
// No public HTTP route, no new secrets, no Etsy or PrintShrimp mutations.
import { getStore } from "@netlify/blobs";
import { accessToken } from "./canva-print-check.mjs";
import { advanceApprovedMaster, APPROVED_MASTER, PRIVATE_APPROVED_STORE } from "../../lib/approved-export.mjs";

const BASE="https://api.canva.com/rest/v1";
const env=name=>process.env[name] || (typeof Netlify!=="undefined" ? Netlify.env?.get?.(name) : undefined);

async function runApprovedExport() {
  const clientId=env("CANVA_CLIENT_ID"), clientSecret=env("CANVA_CLIENT_SECRET");
  if(!clientId||!clientSecret)throw Error("Canva credentials are unavailable");
  const cfg={clientId,clientSecret};
  const store=getStore(PRIVATE_APPROVED_STORE);
  let token;
  const auth=async()=>{
    if(!token)token=await accessToken(cfg);
    return token;
  };
  const call=async(url,init={})=>{
    const response=await fetch(url,{
      ...init,
      headers:{Authorization:"Bearer "+await auth(),...(init.headers||{})},
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw Error("Canva API request failed: HTTP "+response.status);
    return response.json();
  };
  return advanceApprovedMaster({
    store,
    canva:{
      design:async id=>(await call(BASE+"/designs/"+encodeURIComponent(id))).design,
      page:async id=>(await call(BASE+"/designs/"+encodeURIComponent(id)+"/pages?limit=1")).items?.[0],
      createExport:async(id,width)=>(await call(BASE+"/exports",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({design_id:id,format:{type:"png",lossless:true,width,pages:[1]}})
      })).job,
      exportStatus:async id=>(await call(BASE+"/exports/"+encodeURIComponent(id))).job
    },
    download:async url=>fetch(url,{redirect:"error",signal:AbortSignal.timeout(25000)})
  });
}

export default async function handler() {
  // The scheduled worker cannot be triggered with a public URL.
  try {
    const result=await runApprovedExport();
    // Never log tokens, signed URLs or the actual print artwork.
    console.info("Approved A3 sync phase:",result.phase);
    return new Response(null,{status:204});
  } catch {
    console.error("Approved A3 sync temporarily failed; existing job is retained.");
    return new Response(null,{status:204});
  }
}
// Netlify scheduled functions execute ONLY for the published deploy.
// Six checks per day; once complete, each run reads a single private state record and exits.
export const config={schedule:"0 */4 * * *"};
