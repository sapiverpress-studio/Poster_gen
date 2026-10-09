import {getStore} from '@netlify/blobs';
import {etsySetup,ETSY_STORE} from '../../lib/etsy-oauth.mjs';
import {createEtsySession} from '../../lib/etsy-session.mjs';
import {createPosterUploadHandler} from '../../lib/poster-upload-web.mjs';
const env=n=>Netlify.env.get(n);
export default async(req,context)=>{try{const client=createEtsySession({store:getStore(ETSY_STORE),config:etsySetup(env)});return await createPosterUploadHandler({env,client,uploads:getStore('sapiver-poster-uploads')})(req,context);}catch{return new Response('Poster service unavailable. Your saved progress is retained.',{status:503,headers:{'Cache-Control':'no-store'}});}};
export const config={path:['/poster/upload','/poster/uploads','/poster/uploads/*'],rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:120}};
