// Dispatch can arrive before the eventually consistent queue listing catches up.
// Poll only an explicitly started worker, with a bounded wait and no job replay.
export async function collectGithubJobs({rpc,event,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 for(let attempt=0;attempt<=5;attempt++){
  const result=await rpc({op:'list',store:'sapiver-github-queue',prefix:'jobs/'});
  if(!Array.isArray(result?.jobs))throw Error('Invalid queue response');
  if(result.jobs.length||event!=='workflow_dispatch'||attempt===5)return result.jobs;
  await wait(15000);
 }
}
