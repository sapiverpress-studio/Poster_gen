import {createHash} from 'node:crypto';
export const BOOK_ID=/^hb-[a-f0-9]{32}$/;
const HASH=/^[a-f0-9]{64}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Exact manifest + print-interior identity. Both tools read the original ZIP.
// Corrections to an existing publication require a separately authorised mapping;
// never silently redirect a printed QR to a different book.
export function bookIdentity(manifestBytes,interiorBytes){
 if(!manifestBytes?.length||!interiorBytes?.length)throw Error('Missing book identity inputs');
 const manifestHash=sha(manifestBytes),interiorHash=sha(interiorBytes);
 return {bookId:'hb-'+sha('sapiver-book-v1\n'+manifestHash+'\n'+interiorHash).slice(0,32),manifestHash,interiorHash};
}
export function bookAddress(origin,bookId){
 const u=new URL(origin);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!BOOK_ID.test(bookId))throw Error('Invalid companion origin or book identity');
 return u.origin+'/play/'+bookId+'/';
}
export function assertPublishedBook(record,identity,origin){
 if(!record||!identity||record.status!=='published'||record.bookId!==identity.bookId||record.manifestHash!==identity.manifestHash||record.interiorHash!==identity.interiorHash||
 !HASH.test(record.manifestHash)||!HASH.test(record.interiorHash)||record.url!==bookAddress(origin,identity.bookId)||!HASH.test(record.interactiveHash))throw Error('Matching published interactive edition required');
 return record.url;
}
// An exact URL and identity are required, not merely a successful HTTP status.
export async function verifiedBookAddress({identity,record,origin,fetchImpl=fetch}){
 const url=assertPublishedBook(record,identity,origin);
 const response=await fetchImpl(url+'publication.json',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Companion publication receipt unavailable');
 const receipt=await response.json();
 if(assertPublishedBook(receipt,identity,origin)!==url||receipt.interactiveHash!==record.interactiveHash)throw Error('Companion publication mismatch');
 const page=await fetchImpl(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!page.ok||!/^text\/html(?:;|$)/i.test(page.headers.get('content-type')||''))throw Error('Companion book is not accessible');
 if(sha(Buffer.from(await page.arrayBuffer()))!==record.interactiveHash)throw Error('Companion HTML does not match its receipt');
 return url;
}
