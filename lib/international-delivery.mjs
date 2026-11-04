// Read-only, fail-closed delivery-profile checks. No Etsy or supplier writes.
// Switching the international default requires an explicit release configuration;
// this module does NOT establish that Etsy's declared dispatch origin matches
// every local PrintShrimp production facility.
import {verifyTemplateProfiles, verifyTemplateCarrier} from './poster-template.mjs';

export const INTERNATIONAL_PROFILE_TITLE = 'PrintShrimp — International Test';
export const INTERNATIONAL_COUNTRIES = Object.freeze(['GB','US','CA','AU','NZ']);
const positive = value => Number.isSafeInteger(value) && value > 0;
const fail = message => { throw Error(message); };

// Production can pin the exact approved Etsy profile ID. When configured,
// turning off international shipping must BLOCK new physical products rather
// than silently creating UK-only listings. Tests/other shops can omit the pin.
export function requiredPhysicalDeliveryMode(env=()=>undefined) {
  const expected=env('POSTER_REQUIRED_SHIPPING_PROFILE_ID');
  const enabled=env('POSTER_INTERNATIONAL_SHIPPING_ENABLED')==='true';
  if(expected!=null&&expected!==''){
    if(!/^[1-9][0-9]*$/.test(String(expected))||
       !Number.isSafeInteger(Number(expected)))
      fail('Invalid required Etsy delivery profile ID');
    if(!enabled)fail('Required international delivery is disabled; physical listing creation stopped');
  }
  return enabled?'international':'domestic';
}

export function verifyRequiredPhysicalProfile({env=()=>undefined,deliveryMode,shippingProfileId}) {
  const expected=env('POSTER_REQUIRED_SHIPPING_PROFILE_ID');
  if(expected!=null&&expected!==''){
    if(!/^[1-9][0-9]*$/.test(String(expected))||
       !Number.isSafeInteger(Number(expected)))
      fail('Invalid required Etsy delivery profile ID');
    if(deliveryMode!=='international'||shippingProfileId!==Number(expected)||
       env('POSTER_INTERNATIONAL_SHIPPING_ENABLED')!=='true')
      fail('Physical listing blocked: expected approved international delivery profile');
  }
}


function gbp(cost) {
  if (!cost || !Number.isSafeInteger(cost.amount)) return null;
  const divisor = cost.divisor == null ? 100 : cost.divisor;
  if (!Number.isSafeInteger(divisor) || divisor <= 0 ||
      (cost.currency_code != null && cost.currency_code !== 'GBP')) return null;
  return cost.amount / divisor;
}

export function verifyInternationalDeliveryProfile(shipping) {
  if (!positive(shipping?.shipping_profile_id) ||
      shipping.title !== INTERNATIONAL_PROFILE_TITLE || shipping.is_deleted ||
      shipping.origin_country_iso !== 'GB' ||
      shipping.origin_postal_code?.replace(/\s/g, '').toUpperCase() !== 'RM66AX') {
    fail('International delivery profile identity or UK origin differs from reviewed settings');
  }
  if (!Array.isArray(shipping.shipping_profile_destinations) ||
      shipping.shipping_profile_destinations.length !== INTERNATIONAL_COUNTRIES.length ||
      (shipping.shipping_profile_upgrades || []).length) {
    fail('International delivery destinations or upgrades have changed');
  }
  const rows = new Map();
  for (const destination of shipping.shipping_profile_destinations) {
    const iso = destination?.destination_country_iso;
    if (!INTERNATIONAL_COUNTRIES.includes(iso) || rows.has(iso)) {
      fail('Unexpected or duplicate international destination');
    }
    const primary = gbp(destination.primary_cost);
    const secondary = gbp(destination.secondary_cost);
    if (primary == null || secondary == null || secondary < 0 ||
        (iso === 'NZ' ? primary < 8.49 || primary > 100 || secondary !== 0 :
          primary !== 0 || secondary !== 0)) {
      fail('International delivery charge differs from approved country rules');
    }
    const carrier = positive(destination.shipping_carrier_id) &&
      typeof destination.mail_class === 'string' && destination.mail_class.length > 0;
    const days = Number.isSafeInteger(destination.min_delivery_days) &&
      Number.isSafeInteger(destination.max_delivery_days) &&
      destination.min_delivery_days > 0 && destination.max_delivery_days <= 45 &&
      destination.min_delivery_days <= destination.max_delivery_days;
    if (!carrier && !days) fail('International delivery service or transit time missing');
    rows.set(iso, {primary, secondary});
  }
  if (INTERNATIONAL_COUNTRIES.some(iso => !rows.has(iso))) fail('International destination missing');
  return {profileId: shipping.shipping_profile_id, countries: INTERNATIONAL_COUNTRIES.slice()};
}

export function verifyPhysicalDeliveryProfile({shipping,processing,returns,shopId,mode='domestic',carriers}) {
  if (mode === 'domestic') {
    verifyTemplateProfiles(shipping,processing,returns,shopId);
    verifyTemplateCarrier(shipping,carriers);
  } else if (mode === 'international') {
    verifyInternationalDeliveryProfile(shipping);
    if (processing?.shop_id !== shopId || processing.readiness_state !== 'made_to_order' ||
        processing.min_processing_days !== 1 || processing.max_processing_days !== 2 ||
        returns?.shop_id !== shopId || returns.accepts_returns !== true ||
        returns.accepts_exchanges !== true) fail('Processing or returns policy differs from approved template');
  } else fail('Unsupported physical shipping mode');
  return {mode,shippingProfileId:shipping.shipping_profile_id};
}

/**
 * Read authoritative delivery destinations if the main shipping profile GET
 * returns only metadata. Never invent a country or use a client-side profile ID.
 */
export async function readCompleteDeliveryProfile({client,shopId,profileId}) {
  if(!positive(shopId)||!positive(profileId))fail('Invalid Etsy shipping profile identity');
  const root='/shops/'+shopId+'/shipping-profiles/'+profileId;
  const profile=await client.api(root);
  if(profile?.shipping_profile_id!=null&&profile.shipping_profile_id!==profileId)fail('Etsy shipping profile identity mismatch');
  if(Array.isArray(profile.shipping_profile_destinations))return profile;
  const response=await client.api(root+'/destinations');
  if(!Array.isArray(response?.results)||response.results.length>100)
    fail('Etsy shipping destinations unavailable');
  return {...profile,shipping_profile_destinations:response.results};
}
