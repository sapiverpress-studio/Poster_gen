import {refreshListingPresentation} from './listing-presentation-refresh.mjs';
export const refreshCatListing=options=>refreshListingPresentation({...options,sku:'SP-THIS-SEATS-TAKEN'});
