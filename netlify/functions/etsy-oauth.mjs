import {getStore} from '@netlify/blobs';
import {ETSY_STORE} from '../../lib/etsy-oauth.mjs';
import {createQueuedEtsyHandler,QUEUE_STORE} from '../../lib/github-web.mjs';
export default req=>createQueuedEtsyHandler({env:n=>Netlify.env.get(n),etsyStore:getStore(ETSY_STORE),queue:getStore(QUEUE_STORE)})(req);
export const config={path:['/etsy/start','/etsy/callback'],rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:20}};
