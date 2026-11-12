/** Sent with a form Markless sends in place, so the app's api/ wrapper answers a redirect without the browser following it. */
export const IN_PLACE_REQUEST_HEADER = 'x-markless-in-place';
/** Where that redirect pointed, on the body-less answer the wrapper gives instead. */
export const IN_PLACE_LOCATION_HEADER = 'x-markless-location';
