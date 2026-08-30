-- ============================================================================
-- Migration 011 — stamp the due amount directly on the order at the moment
-- payment completes, instead of reconstructing it later by re-summing the
-- `payments` table. That reconstruction was the source of a real bug: if a
-- payments row ever failed to write (a dropped request on a flaky mobile
-- connection, for instance), the money still correctly landed in Accounts,
-- but any report re-deriving "was this due" from the now-incomplete
-- payments rows would wrongly conclude the whole bill was still unpaid —
-- even though customers.outstanding_due (which never depends on that
-- table) was already correctly at zero.
--
-- Backfills existing orders using the old best-available method, one time,
-- so historical accuracy isn't lost — everything going forward gets the
-- reliable, directly-stamped value instead.
--
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

alter table orders add column if not exists due_amount numeric(10,2) default 0;

update orders o
set due_amount = greatest(0, o.total - coalesce((select sum(p.amount) from payments p where p.order_id = o.id), 0))
where o.status = 'paid' and o.due_amount = 0;
