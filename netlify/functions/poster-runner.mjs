import {getStore} from '@netlify/blobs';
import {etsySetup,ETSY_STORE} from '../../lib/etsy-oauth.mjs';
import {PRIVATE_APPROVED_STORE} from '../../lib/approved-export.mjs';
import {createEtsySession} from '../../lib/etsy-session.mjs';
import {createPosterRunner} from '../../lib/poster-workflow.mjs';
const env=n=>Netlify.env.get(n);
export default async req=>{try{const etsyStore=getStore(ETSY_STORE);await createPosterRunner({env,etsyStore,jobs:getStore('sapiver-poster-jobs'),approvedStore:getStore(PRIVATE_APPROVED_STORE),client:createEtsySession({store:etsyStore,config:etsySetup(env)})})(req);}catch{}};
export const config={path:'/poster/run',background:true};
