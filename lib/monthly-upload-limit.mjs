import {listProducts,validId} from './product-records.mjs';

export const MONTHLY_UPLOAD_LIMIT=52;
const slots=Array.from({length:MONTHLY_UPLOAD_LIMIT},(_,i)=>String(i+1).padStart(2,'0'));

// Count new products started on UK calendar dates, not worker runs,
// re-approvals, Etsy variations, or revisions of an existing product.
export function ukUploadMonth(at=Date.now()){
 const date=new Date(at);
 if(!Number.isFinite(date.getTime()))throw Error('Cannot establish upload month');
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit'}).formatToParts(date);
 const year=parts.find(p=>p.type==='year')?.value,month=parts.find(p=>p.type==='month')?.value;
 if(!/^\d{4}$/.test(year)||!/^(0[1-9]|1[0-2])$/.test(month))throw Error('Invalid upload month');
 return year+'-'+month;
}

const monthLabel=month=>{
 const [year,number]=month.split('-').map(Number);
 return new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'Europe/London'}).format(new Date(Date.UTC(year,number-1,15)));
};
const slotKey=(month,index)=>'limits/monthly-uploads/'+month+'/slot/'+slots[index];

export async function monthlyUploadStatus({uploads,clock=()=>Date.now(),products}){
 const month=ukUploadMonth(clock());
 const records=products||await listProducts(uploads);
 const unique=new Set(records.filter(p=>validId(p.productId)&&Number.isFinite(p.createdAt)&&ukUploadMonth(p.createdAt)===month).map(p=>p.productId));
 const occupied=new Set();
 const claims=await Promise.all(slots.map((_,i)=>uploads.get(slotKey(month,i),{type:'json',consistency:'strong'})));
 for(let i=0;i<claims.length;i++){
  const v=claims[i];
  if(v!==null&&v!==undefined){
   if(!validId(v.productId)||v.month!==month)throw Error('Monthly upload capacity needs investigation');
   occupied.add(i);unique.add(v.productId);
  }
 }
 const used=unique.size;
 return {month,label:monthLabel(month),used,remaining:Math.max(0,MONTHLY_UPLOAD_LIMIT-used),
  limit:MONTHLY_UPLOAD_LIMIT,blocked:used>=MONTHLY_UPLOAD_LIMIT,occupied};
}

export async function reserveMonthlyUpload({uploads,productId,clock=()=>Date.now()}){
 if(!validId(productId))throw Error('Invalid product reservation');
 // The independent create-if-absent slots are atomic. Recheck ALL slots
 // after every collision, including concurrent requests in other tabs.
 for(let attempt=0;attempt<=MONTHLY_UPLOAD_LIMIT;attempt++){
  const status=await monthlyUploadStatus({uploads,clock});
  if(status.blocked)return {accepted:false,status};
  const next=slots.findIndex((_,i)=>!status.occupied.has(i));
  if(next<0)throw Error('Monthly upload capacity needs investigation');
  const result=await uploads.setJSON(slotKey(status.month,next),
   {productId,month:status.month,reservedAt:clock()},{onlyIfNew:true});
  if(result?.modified===true)return {accepted:true,status:{...status,used:status.used+1,
   remaining:Math.max(0,status.remaining-1),blocked:status.used+1>=MONTHLY_UPLOAD_LIMIT}};
 }
 throw Error('Monthly upload reservations are busy; retry later');
}
