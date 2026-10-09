import {getStore} from '@netlify/blobs';
import {ETSY_STORE} from '../../lib/etsy-oauth.mjs';
import {createPosterOwnerHandler} from '../../lib/poster-workflow.mjs';
import {websiteEnv} from '../../lib/github-web.mjs';
export default (req,context)=>createPosterOwnerHandler({env:websiteEnv(n=>Netlify.env.get(n)),jobs:getStore('sapiver-poster-jobs'),etsyStore:getStore(ETSY_STORE),githubMode:true})(req,context);
export const config={path:'/poster/workflow',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:20}};
