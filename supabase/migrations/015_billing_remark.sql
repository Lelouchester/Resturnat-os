-- ============================================================================
-- 015_billing_remark.sql
-- A free-text remark staff can attach at the moment of billing — e.g.
-- "regular's birthday, gave extra dessert", "AC was broken, apologized with
-- discount". Deliberately a separate column from activity_note (migration
-- 009), which is auto-generated system text ("Transferred from Table 1")
-- — mixing the two would mean one silently overwrites the other whenever
-- both a transfer and a manual remark apply to the same order.
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

alter table orders add column if not exists billing_remark text;
comment on column orders.billing_remark is
  'Free-text note entered by staff at billing time, for special cases worth
   flagging later (comps, complaints, VIP notes). Separate from
   activity_note, which is system-generated transfer/merge history.';
