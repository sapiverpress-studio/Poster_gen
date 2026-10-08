import { createHash } from "node:crypto";

export const TEST_DESIGN = Object.freeze({id:"DAHXUnmHofY", title:"Dinosaurs across time", width:1024, height:1536});
export const PAPER_MM = Object.freeze({
  A5:[148,210], A4:[210,297], A3:[297,420], A2:[420,594], A1:[594,841],
});
export function inspectPNG(input) {
  const bytes=Buffer.from(input);
  if(bytes.length<33 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    throw Error("Invalid PNG signature");
  if(bytes.toString("ascii",12,16)!=="IHDR" || bytes.readUInt32BE(8)!==13)
    throw Error("Missing PNG IHDR");
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width || !height || width>25000 || height>25000) throw Error("Invalid PNG dimensions");
  return {width,height,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};
}
export function printReadiness(width,height) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error("Invalid dimensions");
  const ratio=height/width;
  const target=Math.sqrt(2);
  return {
    ratio: Math.round(ratio*10000)/10000,
    a_series_ratio_difference_percent: Math.round(Math.abs(ratio/target-1)*10000)/100,
    a_series_ratio_matches: Math.abs(ratio/target-1) <= 0.002,
    print_sizes:Object.fromEntries(Object.entries(PAPER_MM).map(([paper,[mmw,mmh]])=>{
      const effective=Math.min(width/(mmw/25.4),height/(mmh/25.4));
      return [paper,{effective_ppi:Math.round(effective),passes_300ppi:Math.round(effective)>=300}];
    }))
  };
}
export function safeCanvaDownloadUrl(value) {
  let u;
  try{u=new URL(value);}catch{return false;}
  return u.protocol==="https:" && (u.hostname==="canva.com"||u.hostname.endsWith(".canva.com")) && !u.username && !u.password;
}
