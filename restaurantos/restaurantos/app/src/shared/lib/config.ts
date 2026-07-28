/**
 * Single-branch placeholder. Once multi-branch switching is built, this
 * becomes "whichever branch this deployment/device is configured for"
 * instead of a hardcoded constant — for now, one deployment = one cafe.
 *
 * There is no CURRENT_STAFF_ID anymore — the real signed-in staff member
 * (via Google sign-in) is read from useAuthStore().staff.id at the point of
 * use, since it depends on who's actually logged in.
 */
export const CURRENT_BRANCH_ID = '00000000-0000-0000-0000-000000000001'
