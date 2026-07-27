/**
 * Single-branch, single-"logged in as" placeholders. Once real staff PIN
 * login exists, these become "whichever branch/staff member is actually
 * logged in" instead of hardcoded constants. Both match the rows inserted
 * by supabase/seed.sql.
 */
export const CURRENT_BRANCH_ID = '00000000-0000-0000-0000-000000000001'
export const CURRENT_STAFF_ID = '20000000-0000-0000-0000-000000000001' // "Anjali (Manager)" from seed.sql
