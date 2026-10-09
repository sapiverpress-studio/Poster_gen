import {getStore} from '@netlify/blobs';
import {createMasterStreamHandler} from '../../lib/master-stream.mjs';
export default createMasterStreamHandler({store:()=>getStore('sapiver-print-approved')});
export const config={path:'/print/master.png'};
