import {getStore} from '@netlify/blobs';
import {createPosterUploadHandler} from '../../lib/poster-upload-web.mjs';
import {websiteEnv,cachedClient,githubDispatch,QUEUE_STORE} from '../../lib/github-web.mjs';
export default async(req,context)=>{try{const env=websiteEnv(n=>Netlify.env.get(n)),uploads=getStore('sapiver-poster-uploads'),queue=getStore(QUEUE_STORE);return await createPosterUploadHandler({env,uploads,queue,client:await cachedClient(uploads),dispatchJob:githubDispatch(queue)})(req,context);}catch{return new Response('Poster service unavailable. Your saved progress is retained.',{status:503,headers:{'Cache-Control':'no-store'}});}};
export const config={path:['/poster/products','/poster/upload','/poster/uploads','/poster/uploads/*','/poster/catalog/status','/poster/catalog/refresh'],rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:120}};
