import {getStore} from '@netlify/blobs';
import {createEtsyHandler,ETSY_STORE} from '../../lib/etsy-oauth.mjs';
const env=name=>typeof Netlify!=='undefined'&&Netlify.env?.get?Netlify.env.get(name):process.env[name];
export default createEtsyHandler({env,store:()=>getStore(ETSY_STORE)});
export const config={path:['/etsy/start','/etsy/callback'],rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:6}};
