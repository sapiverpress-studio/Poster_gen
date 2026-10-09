import {getStore} from '@netlify/blobs';
import {etsySetup,ETSY_STORE} from '../../lib/etsy-oauth.mjs';
import {createEtsySession} from '../../lib/etsy-session.mjs';
import {createUploadRunner} from '../../lib/poster-upload-runner.mjs';
const env=n=>Netlify.env.get(n);
export default async req=>{try{const etsyStore=getStore(ETSY_STORE);await createUploadRunner({env,etsyStore,uploads:getStore('sapiver-poster-uploads'),client:createEtsySession({store:etsyStore,config:etsySetup(env)})})(req);}catch{}};
export const config={path:'/poster/upload-run',background:true};
