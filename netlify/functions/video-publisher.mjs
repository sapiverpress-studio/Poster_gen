import { getStore } from '@netlify/blobs';
import { createVideoPublisher } from '../../lib/video-publisher.mjs';
export default async function handler(req){
 try{
  return await createVideoPublisher({store:getStore('sapiver-promo-videos'),env:name=>Netlify.env.get(name)})(req);
 }catch{
  return Response.json({error:'Video service unavailable; saved upload retained'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
export const config={path:['/poster/video','/poster/video/start','/poster/video/*'],rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:200}};
