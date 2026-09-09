-- ============================================================================
-- 016_prevent_duplicate_payment.sql
--
-- A payment should only ever be inserted while an order is still 'open' or
-- 'billing'. Nothing in the schema enforced that before this migration —
-- the RLS policy on payments only checks branch membership, nothing about
-- the order's own state. In practice this meant a double-tap on "Complete
-- Payment", a stale screen left open from earlier, or someone re-opening
-- an already-settled bill could silently insert a second payment against
-- an order that was already paid and closed — no error, no warning, just
-- a real duplicate charge and an inflated revenue figure.
--
-- due_settlements (a customer paying off an old due later) never touches
-- this table at all — that's logged separately via ledger_entries, so
-- this trigger has no legitimate case to make an exception for. Every
-- real payments insert should always be against an order that isn't
-- already paid or cancelled.
--
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

create or replace function prevent_payment_on_closed_order() returns trigger as $$
declare
  v_status text;
begin
  select status into v_status from orders where id = new.order_id;
  if v_status in ('paid', 'cancelled') then
    raise exception 'This order is already % — a payment can''t be added to it. If this bill needs correcting, use Cancel/Reverse instead of billing it again.', v_status;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_payment_on_closed_order on payments;
create trigger trg_prevent_payment_on_closed_order
  before insert on payments
  for each row execute function prevent_payment_on_closed_order();
