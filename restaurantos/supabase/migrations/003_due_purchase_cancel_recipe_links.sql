-- ============================================================================
-- Migration 003 — opening due for customers, cancel a same-day purchase,
-- and menu-item <-> inventory-item links for usage comparison reports.
--
-- Minimal, targeted, idempotent — safe to paste into Supabase's SQL Editor
-- against the live database, and safe to run twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Opening due for customers
-- No schema change needed — customers.outstanding_due and customers.due_since
-- already exist and already behave correctly (see applyPayment/settleDue).
-- This migration just documents that; the app change is in customersStore.ts.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 2) Cancel a purchase (today only)
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type t join pg_enum e on t.oid = e.enumtypid where t.typname = 'purchase_status' and e.enumlabel = 'cancelled') then
    alter type purchase_status add value 'cancelled';
  end if;
end $$;

-- Reverses a purchase in one atomic step: gives back whatever was paid out
-- of Accounts, undoes the shortfall added to the supplier's outstanding
-- balance, and pulls back out any inventory stock that was added on receipt
-- — or none of it, if any part fails. Only allowed for purchases created
-- since the caller's local start-of-day (passed in, since the app already
-- computes "today" client-side the same way for Today's Snapshot — this
-- keeps that definition consistent rather than trusting the server's own
-- timezone). security definer, same narrow-RPC-bypassing-RLS template as
-- transfer_funds() — it enforces its own checks rather than relying on RLS.
create or replace function cancel_purchase(p_purchase_id uuid, p_local_day_start timestamptz)
returns void
language plpgsql security definer as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_purchase purchases%rowtype;
  v_line record;
  v_payment record;
  v_lines_total numeric;
  v_paid_total numeric;
  v_shortfall numeric;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;

  v_branch_id := current_staff_branch();

  select * into v_purchase from purchases where id = p_purchase_id and branch_id = v_branch_id;
  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;

  if v_purchase.status = 'cancelled' then
    raise exception 'purchase is already cancelled';
  end if;

  if v_purchase.created_at < p_local_day_start then
    raise exception 'only a purchase from today can be cancelled';
  end if;

  -- Undo any stock that was added when this purchase was marked received.
  if v_purchase.status = 'received' then
    for v_line in
      select inventory_item_id, quantity, description from purchase_lines
      where purchase_id = p_purchase_id and kind = 'inventory' and inventory_item_id is not null
    loop
      update inventory_items set current_stock = greatest(0, current_stock - v_line.quantity) where id = v_line.inventory_item_id;
      insert into stock_movements (inventory_item_id, type, quantity, note, created_by)
      values (v_line.inventory_item_id, 'adjustment', -v_line.quantity, 'Purchase cancelled: ' || v_line.description, v_staff_id);
    end loop;
  end if;

  -- Give back whatever was actually paid out of Accounts for this purchase.
  for v_payment in
    select pp.amount, a.id as account_id
    from purchase_payments pp
    join accounts a on a.payment_method_id = pp.payment_method_id and a.branch_id = v_branch_id
    where pp.purchase_id = p_purchase_id
  loop
    update accounts set balance = balance + v_payment.amount where id = v_payment.account_id;
    insert into ledger_entries (account_id, amount, reason, purchase_id, created_by)
    values (v_payment.account_id, v_payment.amount, 'purchase cancelled', p_purchase_id, v_staff_id);
  end loop;

  -- Undo any shortfall that was added to the supplier's outstanding balance.
  select coalesce(sum(quantity * unit_cost), 0) into v_lines_total from purchase_lines where purchase_id = p_purchase_id;
  select coalesce(sum(amount), 0) into v_paid_total from purchase_payments where purchase_id = p_purchase_id;
  v_shortfall := greatest(0, v_lines_total - v_paid_total);

  if v_shortfall > 0 and v_purchase.supplier_id is not null then
    update suppliers set outstanding_balance = greatest(0, outstanding_balance - v_shortfall) where id = v_purchase.supplier_id;
  end if;

  update purchases set status = 'cancelled' where id = p_purchase_id;
end;
$$;

grant execute on function cancel_purchase(uuid, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Menu item <-> inventory item links, for usage comparison reports only.
-- Deliberately NOT used for automatic stock deduction (that's the harder,
-- still-unsolved recipe/BOM problem) — this is purely "which menu items are
-- made from this ingredient", used to compare purchased quantity against
-- units sold of the linked items over a period.
-- ----------------------------------------------------------------------------

create table if not exists menu_inventory_links (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete cascade,
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  created_at timestamptz default now(),
  unique (menu_item_id, inventory_item_id)
);

alter table menu_inventory_links enable row level security;

drop policy if exists "staff can access their branch menu_inventory_links" on menu_inventory_links;
create policy "staff can access their branch menu_inventory_links" on menu_inventory_links for all
  using (branch_id = current_staff_branch()) with check (branch_id = current_staff_branch());
