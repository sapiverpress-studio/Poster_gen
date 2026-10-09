import {getStore} from '@netlify/blobs';
import {createPosterUploadHandler} from '../../lib/poster-upload-web.mjs';
import {websiteEnv,cachedClient,githubDispatch,QUEUE_STORE} from '../../lib/github-web.mjs';
export default async(req,context)=>{try{const env=websiteEnv(n=>Netlify.env.get(n)),uploads=getStore('sapiver-poster-uploads');return await createPosterUploadHandler({env,uploads,client:await cachedClient(uploads),dispatchJob:githubDispatch(getStore(QUEUE_STORE))})(req,context);}catch{return new Response('Poster service unavailable. Your saved progress is retained.',{status:503,headers:{'Cache-Control':'no-store'}});}};
export const config={path:['/poster/upload','/poster/uploads','/poster/uploads/*'],rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:120}};
