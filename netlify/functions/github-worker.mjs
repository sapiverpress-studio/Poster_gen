import {getStore} from '@netlify/blobs';
import {createGithubBridge} from '../../lib/github-bridge.mjs';
export default createGithubBridge({env:n=>Netlify.env.get(n),store:name=>getStore(name)});
export const config={path:'/poster/github-worker',method:'POST',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:500}};
