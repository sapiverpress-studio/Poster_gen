import {getStore} from '@netlify/blobs';
import {etsySetup,ETSY_STORE} from '../../lib/etsy-oauth.mjs';
import {createEtsySession} from '../../lib/etsy-session.mjs';
import {createPosterOwnerHandler} from '../../lib/poster-workflow.mjs';
const env=n=>Netlify.env.get(n);
export default (req,context)=>{const jobs=getStore('sapiver-poster-jobs'),etsyStore=getStore(ETSY_STORE);let client;try{client=createEtsySession({store:etsyStore,config:etsySetup(env)});}catch{}
return createPosterOwnerHandler({env,jobs,etsyStore,client})(req,context);};
export const config={path:'/poster/workflow',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:20}};
