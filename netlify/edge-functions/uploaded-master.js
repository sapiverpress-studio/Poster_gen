import {getStore} from '@netlify/blobs';
import {createMasterStreamHandler} from '../../lib/master-stream.mjs';
export default createMasterStreamHandler({store:()=>getStore('sapiver-poster-uploads'),validKey:key=>/^uploads\/[A-Za-z0-9_-]{32}\/master\.png$/.test(key)});
export const config={path:'/poster/artwork.png'};
