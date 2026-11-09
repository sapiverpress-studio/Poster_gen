// UI preview identity: merchant upload receipts still require SHA-256 checks.
export function zipPreviewFingerprint(archive){
 if(!archive||!Array.isArray(archive.items)||!Array.isArray(archive.bundles))return '';
 return JSON.stringify({
  mode:archive.mode,
  items:archive.items.map(x=>({
   folder:x.folder,title:x.title,listingTitle:x.listingTitle,sectionTitle:x.sectionTitle,
   description:x.description,tags:x.tags,printSizes:x.printSizes,crc:x.entry?.crc,bytes:x.bytes
  })),
  bundles:archive.bundles.map(x=>({
   title:x.title,listingTitle:x.listingTitle,sectionTitle:x.sectionTitle,
   members:x.members,size:x.size,tags:x.tags,description:x.description
  }))
 });
}
export function savedSessionMatchesZip({state,archive,signature}){
 return Boolean(state?.version===4&&state?.signature===signature&&
   state?.uploadMode===archive?.mode&&state?.previewFingerprint&&
   state.previewFingerprint===zipPreviewFingerprint(archive));
}
// Always prefer the current ZIP's bundle-1.md title over an unrelated
// browser-session title. Preserve a user-edited title only when the selected
// archive has the same content fingerprint as the saved collection.
export function titleForSelectedZip({state,archive,signature,index}){
 const fromZip=archive?.bundles?.[index]?.listingTitle;
 if(typeof fromZip!=='string'||!fromZip.trim())throw Error('ZIP bundle has no valid Etsy listing title');
 const fromSaved=savedSessionMatchesZip({state,archive,signature})?
   state?.bundles?.[index]?.input?.title:null;
 return typeof fromSaved==='string'&&fromSaved.trim()?fromSaved:fromZip;
}
