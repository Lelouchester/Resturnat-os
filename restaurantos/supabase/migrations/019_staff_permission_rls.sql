-- ============================================================================
-- 019_staff_permission_rls.sql
--
-- CRITICAL FIX. Found during a full audit: the RLS policies on `staff` and
-- `permissions` only checked branch membership — the same as every other
-- table — with no check on whether the acting staff member actually has
-- permission to manage staff. This meant ANY signed-in staff member,
-- including one with zero permissions ticked, could bypass the app's UI
-- entirely (a direct API call using the app's own public Supabase key is
-- all it takes) and:
--   - update their own `staff` row to set role = 'admin'
--   - update the `permissions` table directly to grant themselves any
--     feature, regardless of what the Staff page shows
--   - edit or deactivate any other staff member
--
-- The route-level guard added earlier (RequirePermission) only protects
-- normal use of the app's UI — it does nothing against someone calling
-- the database directly. This is the real fix: the database itself now
-- enforces the same rule, the same way `financials` already correctly
-- does (see current_staff_financials_ok) — this generalizes that same
-- proven pattern to any feature instead of just one.
--
-- SELECT stays branch-scoped only (colleagues' names are needed in many
-- ordinary places — assigning a table, "served by", etc.) — only
-- INSERT/UPDATE/DELETE require the 'staff' permission (or admin/manager).
--
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

create or replace function current_staff_has_permission(p_feature text) returns boolean
language plpgsql stable security definer as $$
declare
  v_staff_id uuid;
  v_role staff_role;
  v_override boolean;
begin
  select id, role into v_staff_id, v_role from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    return false;
  end if;

  select allowed into v_override from permissions where staff_id = v_staff_id and feature_key = p_feature;
  if v_override is not null then
    return v_override;
  end if;

  return v_role in ('admin', 'manager');
end;
$$;

drop policy if exists "staff can access their branch staff" on staff;
drop policy if exists "staff can view their branch staff" on staff;
drop policy if exists "staff-permitted staff can add their branch staff" on staff;
drop policy if exists "staff-permitted staff can edit their branch staff" on staff;
drop policy if exists "staff-permitted staff can remove their branch staff" on staff;
create policy "staff can view their branch staff" on staff for select
  using (branch_id = current_staff_branch());
create policy "staff-permitted staff can add their branch staff" on staff for insert
  with check (branch_id = current_staff_branch() and current_staff_has_permission('staff'));
create policy "staff-permitted staff can edit their branch staff" on staff for update
  using (branch_id = current_staff_branch() and current_staff_has_permission('staff'))
  with check (branch_id = current_staff_branch() and current_staff_has_permission('staff'));
create policy "staff-permitted staff can remove their branch staff" on staff for delete
  using (branch_id = current_staff_branch() and current_staff_has_permission('staff'));

drop policy if exists "staff can access their branch permissions" on permissions;
drop policy if exists "staff can view their branch permissions" on permissions;
drop policy if exists "staff-permitted staff can set their branch permissions" on permissions;
drop policy if exists "staff-permitted staff can edit their branch permissions" on permissions;
drop policy if exists "staff-permitted staff can remove their branch permissions" on permissions;
create policy "staff can view their branch permissions" on permissions for select
  using (exists (select 1 from staff where staff.id = permissions.staff_id and staff.branch_id = current_staff_branch()));
create policy "staff-permitted staff can set their branch permissions" on permissions for insert
  with check (
    exists (select 1 from staff where staff.id = permissions.staff_id and staff.branch_id = current_staff_branch())
    and current_staff_has_permission('staff')
  );
create policy "staff-permitted staff can edit their branch permissions" on permissions for update
  using (
    exists (select 1 from staff where staff.id = permissions.staff_id and staff.branch_id = current_staff_branch())
    and current_staff_has_permission('staff')
  )
  with check (
    exists (select 1 from staff where staff.id = permissions.staff_id and staff.branch_id = current_staff_branch())
    and current_staff_has_permission('staff')
  );
create policy "staff-permitted staff can remove their branch permissions" on permissions for delete
  using (
    exists (select 1 from staff where staff.id = permissions.staff_id and staff.branch_id = current_staff_branch())
    and current_staff_has_permission('staff')
  );

-- Same gap, same fix, for the tables the Settings page controls — tax
-- rate, service charge, restaurant name/address, and which payment
-- methods exist. SELECT stays broad since these values are read
-- constantly during ordinary billing (computing tax/service charge,
-- printing a receipt) regardless of who has the 'settings' permission —
-- only actually changing them requires it.
drop policy if exists "staff can update their own branch" on branches;
drop policy if exists "settings-permitted staff can update their own branch" on branches;
create policy "settings-permitted staff can update their own branch" on branches for update
  using (id = current_staff_branch() and current_staff_has_permission('settings'))
  with check (id = current_staff_branch() and current_staff_has_permission('settings'));

drop policy if exists "staff can access their branch restaurant_settings" on restaurant_settings;
drop policy if exists "staff can view their branch restaurant_settings" on restaurant_settings;
drop policy if exists "settings-permitted staff can insert their branch restaurant_settings" on restaurant_settings;
drop policy if exists "settings-permitted staff can edit their branch restaurant_settings" on restaurant_settings;
drop policy if exists "settings-permitted staff can delete their branch restaurant_settings" on restaurant_settings;
create policy "staff can view their branch restaurant_settings" on restaurant_settings for select
  using (branch_id = current_staff_branch());
create policy "settings-permitted staff can insert their branch restaurant_settings" on restaurant_settings for insert
  with check (branch_id = current_staff_branch() and current_staff_has_permission('settings'));
create policy "settings-permitted staff can edit their branch restaurant_settings" on restaurant_settings for update
  using (branch_id = current_staff_branch() and current_staff_has_permission('settings'))
  with check (branch_id = current_staff_branch() and current_staff_has_permission('settings'));
create policy "settings-permitted staff can delete their branch restaurant_settings" on restaurant_settings for delete
  using (branch_id = current_staff_branch() and current_staff_has_permission('settings'));

drop policy if exists "staff can access their branch payment_methods" on payment_methods;
drop policy if exists "staff can view their branch payment_methods" on payment_methods;
drop policy if exists "settings-permitted staff can insert their branch payment_methods" on payment_methods;
drop policy if exists "settings-permitted staff can edit their branch payment_methods" on payment_methods;
drop policy if exists "settings-permitted staff can delete their branch payment_methods" on payment_methods;
create policy "staff can view their branch payment_methods" on payment_methods for select
  using (branch_id = current_staff_branch());
create policy "settings-permitted staff can insert their branch payment_methods" on payment_methods for insert
  with check (branch_id = current_staff_branch() and current_staff_has_permission('settings'));
create policy "settings-permitted staff can edit their branch payment_methods" on payment_methods for update
  using (branch_id = current_staff_branch() and current_staff_has_permission('settings'))
  with check (branch_id = current_staff_branch() and current_staff_has_permission('settings'));
create policy "settings-permitted staff can delete their branch payment_methods" on payment_methods for delete
  using (branch_id = current_staff_branch() and current_staff_has_permission('settings'));

-- Nothing in the app ever deletes an account row — and deleting one
-- cascades (accounts -> ledger_entries on delete cascade) into
-- permanently destroying every deposit/withdrawal ever recorded for that
-- payment method, with no way to recover it. This policy served no
-- legitimate purpose and was pure risk; removing it entirely rather than
-- gating it, since there's no scenario where deleting an account through
-- the API (as opposed to a careful, backed-up manual database operation)
-- is the right move for anyone, permission or not.
drop policy if exists "staff can delete their branch accounts" on accounts;

-- Same reasoning, applied systemically: none of these six tables are
-- ever deleted from by any legitimate app code path — they're all
-- historical/audit-trail records (a payment once taken, an item once
-- billed, a stock movement once logged, a purchase line once bought, a
-- shift's closing snapshot). The original "for all" policies granted
-- DELETE on every one of them anyway, with no legitimate use and real
-- damage potential — a payment row being deletable, for instance, is
-- exactly how someone could take a customer's cash and then erase the
-- record of it. Each is split into the same select/insert/update access
-- as before, just with DELETE removed rather than granted by default.

drop policy if exists "staff can access their branch payments" on payments;
drop policy if exists "staff can view their branch payments" on payments;
create policy "staff can view their branch payments" on payments for select
  using (exists (select 1 from orders where orders.id = payments.order_id and orders.branch_id = current_staff_branch()));
drop policy if exists "staff can add their branch payments" on payments;
create policy "staff can add their branch payments" on payments for insert
  with check (exists (select 1 from orders where orders.id = payments.order_id and orders.branch_id = current_staff_branch()));
drop policy if exists "staff can edit their branch payments" on payments;
create policy "staff can edit their branch payments" on payments for update
  using (exists (select 1 from orders where orders.id = payments.order_id and orders.branch_id = current_staff_branch()))
  with check (exists (select 1 from orders where orders.id = payments.order_id and orders.branch_id = current_staff_branch()));

drop policy if exists "staff can access their branch order_items" on order_items;
drop policy if exists "staff can view their branch order_items" on order_items;
create policy "staff can view their branch order_items" on order_items for select
  using (exists (select 1 from orders where orders.id = order_items.order_id and orders.branch_id = current_staff_branch()));
drop policy if exists "staff can add their branch order_items" on order_items;
create policy "staff can add their branch order_items" on order_items for insert
  with check (exists (select 1 from orders where orders.id = order_items.order_id and orders.branch_id = current_staff_branch()));
drop policy if exists "staff can edit their branch order_items" on order_items;
create policy "staff can edit their branch order_items" on order_items for update
  using (exists (select 1 from orders where orders.id = order_items.order_id and orders.branch_id = current_staff_branch()))
  with check (exists (select 1 from orders where orders.id = order_items.order_id and orders.branch_id = current_staff_branch()));

drop policy if exists "staff can access their branch purchase_lines" on purchase_lines;
drop policy if exists "staff can view their branch purchase_lines" on purchase_lines;
create policy "staff can view their branch purchase_lines" on purchase_lines for select
  using (exists (select 1 from purchases where purchases.id = purchase_lines.purchase_id and purchases.branch_id = current_staff_branch()));
drop policy if exists "staff can add their branch purchase_lines" on purchase_lines;
create policy "staff can add their branch purchase_lines" on purchase_lines for insert
  with check (exists (select 1 from purchases where purchases.id = purchase_lines.purchase_id and purchases.branch_id = current_staff_branch()));
drop policy if exists "staff can edit their branch purchase_lines" on purchase_lines;
create policy "staff can edit their branch purchase_lines" on purchase_lines for update
  using (exists (select 1 from purchases where purchases.id = purchase_lines.purchase_id and purchases.branch_id = current_staff_branch()))
  with check (exists (select 1 from purchases where purchases.id = purchase_lines.purchase_id and purchases.branch_id = current_staff_branch()));

drop policy if exists "staff can access their branch purchase_payments" on purchase_payments;
drop policy if exists "staff can view their branch purchase_payments" on purchase_payments;
create policy "staff can view their branch purchase_payments" on purchase_payments for select
  using (exists (select 1 from purchases where purchases.id = purchase_payments.purchase_id and purchases.branch_id = current_staff_branch()));
drop policy if exists "staff can add their branch purchase_payments" on purchase_payments;
create policy "staff can add their branch purchase_payments" on purchase_payments for insert
  with check (exists (select 1 from purchases where purchases.id = purchase_payments.purchase_id and purchases.branch_id = current_staff_branch()));
drop policy if exists "staff can edit their branch purchase_payments" on purchase_payments;
create policy "staff can edit their branch purchase_payments" on purchase_payments for update
  using (exists (select 1 from purchases where purchases.id = purchase_payments.purchase_id and purchases.branch_id = current_staff_branch()))
  with check (exists (select 1 from purchases where purchases.id = purchase_payments.purchase_id and purchases.branch_id = current_staff_branch()));

drop policy if exists "staff can access their branch stock_movements" on stock_movements;
drop policy if exists "staff can view their branch stock_movements" on stock_movements;
create policy "staff can view their branch stock_movements" on stock_movements for select
  using (exists (select 1 from inventory_items where inventory_items.id = stock_movements.inventory_item_id and inventory_items.branch_id = current_staff_branch()));
drop policy if exists "staff can add their branch stock_movements" on stock_movements;
create policy "staff can add their branch stock_movements" on stock_movements for insert
  with check (exists (select 1 from inventory_items where inventory_items.id = stock_movements.inventory_item_id and inventory_items.branch_id = current_staff_branch()));
drop policy if exists "staff can edit their branch stock_movements" on stock_movements;
create policy "staff can edit their branch stock_movements" on stock_movements for update
  using (exists (select 1 from inventory_items where inventory_items.id = stock_movements.inventory_item_id and inventory_items.branch_id = current_staff_branch()))
  with check (exists (select 1 from inventory_items where inventory_items.id = stock_movements.inventory_item_id and inventory_items.branch_id = current_staff_branch()));

drop policy if exists "staff can access their branch shift_balances" on shift_balances;
drop policy if exists "staff can view their branch shift_balances" on shift_balances;
create policy "staff can view their branch shift_balances" on shift_balances for select
  using (exists (select 1 from shifts where shifts.id = shift_balances.shift_id and shifts.branch_id = current_staff_branch()));
drop policy if exists "staff can add their branch shift_balances" on shift_balances;
create policy "staff can add their branch shift_balances" on shift_balances for insert
  with check (exists (select 1 from shifts where shifts.id = shift_balances.shift_id and shifts.branch_id = current_staff_branch()));
drop policy if exists "staff can edit their branch shift_balances" on shift_balances;
create policy "staff can edit their branch shift_balances" on shift_balances for update
  using (exists (select 1 from shifts where shifts.id = shift_balances.shift_id and shifts.branch_id = current_staff_branch()))
  with check (exists (select 1 from shifts where shifts.id = shift_balances.shift_id and shifts.branch_id = current_staff_branch()));
