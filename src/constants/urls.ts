/**
 * URL constants and builder functions for JNU AI Study Room Booking
 */

export const URLS = {
  SSO_LOGIN: 'https://sso.jnu.ac.kr/Idp/Login.aspx',
  BOOKING_CALENDAR:
    'https://cvg.jnu.ac.kr/cvg/17459/subview.do?enc=Zm5jdDF8QEB8JTJGZmFjaWxpdHklMkZjdmclMkZmYWNpbGl0eUNhbGVuZGFyLmRvJTNG',
  MY_RESERVATIONS_BASE: 'https://cvg.jnu.ac.kr/cvg/17459/subview.do',
  BASE_URL: 'https://cvg.jnu.ac.kr',
} as const;

/**
 * Facility sequence ID for JNU AI College study rooms
 */
export const FACILITY_SEQ = 344;

/**
 * Builds the "My Reservations" URL for a given year and month.
 *
 * The enc query parameter is base64 of:
 *   "fnct1|@@|" + encodeURIComponent(path)
 *
 * @param year  - Full 4-digit year (e.g. 2026)
 * @param month - Month number 1-12
 * @returns Full URL for the my-reservations list page
 */
export function buildMyReservationsUrl(year: number, month: number): string {
  const paddedMonth = String(month).padStart(2, '0');
  const path = `/facility/cvg/myList.do?srchYear=${year}&srchMonth=${paddedMonth}&`;
  const encoded = `fnct1|@@|${encodeURIComponent(path)}`;
  // React Native exposes btoa globally (via Hermes / JSC polyfill)
  const enc = btoa(encoded);
  return `${URLS.MY_RESERVATIONS_BASE}?enc=${enc}`;
}
