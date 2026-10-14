export const STAGE_LABELS=Object.freeze({cancelled:'Previous attempt cleared; original artwork retained',queued:'Waiting for the worker',starting:'Worker started',reading_upload:'Reading your saved artwork',validating_artwork:'Checking PNG dimensions and print resolution',validating_upload:'Validating your digital package',checking_etsy_settings:'Checking Etsy delivery and product settings',checking_etsy_category:'Checking the Etsy category',checking_etsy_connection:'Checking the Etsy connection',creating_previews:'Creating listing previews',saving_review:'Saving your product review',saving_listing_photos:'Saving listing previews',ready_for_approval:'Ready for your review',etsy_draft:'Etsy draft saved',supplier_verified:'PrintShrimp artwork transfer verified',publishing_etsy:'Publishing the approved Etsy listing',complete:'Complete'});
export function progressSummary(asset,job,trigger,now=Date.now()){
 const waiting=['preparing','publishing'].includes(asset.phase)&&(!job||job.phase==='queued');
 const stage=asset.phase==='cancelled'?'cancelled':asset.phase==='ready_for_approval'?'ready_for_approval':waiting?'queued':asset.stage||'starting';
 const updatedAt=asset.updatedAt||job?.startedAt||asset.queuedAt||asset.createdAt||null;
 const elapsedSeconds=Math.max(0,Math.floor((now-(asset.queuedAt||asset.createdAt||now))/1000));
 let note='';
 if(waiting)note=trigger?.phase==='not_configured'?'The website worker trigger needs configuration. Your upload is saved.':trigger?.phase==='failed'?'The worker could not be started. Your upload is saved.':trigger?.phase==='uncertain'?'The start request was interrupted. Your upload is saved; check the worker before retrying.':'Start requested; waiting for GitHub to assign a worker.';
 const overdue=['preparing','publishing'].includes(asset.phase)&&now-(updatedAt||now)>600000;
 if(overdue)note+=' This is taking longer than expected; inspect the worker run before retrying.';
 return {stage,label:STAGE_LABELS[stage]||String(stage).replaceAll('_',' '),elapsedSeconds,updatedAt,waiting,overdue,note,runUrl:/^\d+$/.test(String(asset.workerRunId||''))?'https://github.com/sapiverpress-studio/Poster_gen/actions/runs/'+asset.workerRunId:null};
}
