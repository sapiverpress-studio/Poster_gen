import {repairListingVideo} from './listing-video-repair.mjs';
export const repairCoastVideo=options=>repairListingVideo({...options,sku:'SP-COAST-TO-COAST'});
export const repairCatVideo=options=>repairListingVideo({...options,sku:'SP-THIS-SEATS-TAKEN'});
