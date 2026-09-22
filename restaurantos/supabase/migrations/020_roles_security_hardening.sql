-- ============================================================================
-- 020_roles_security_hardening.sql
--
-- What this does, in plain terms:
--
--  1. NEW ROLE + HIERARCHY. Adds a "shareholder" role and a strict ladder:
--        administrator > shareholder > manager > cashier > waiter/kitchen/store
--     Nobody can create, edit, promote, deactivate or delete anyone at or
--     above their own level (an administrator can manage everyone). Nobody
--     can change their own role or deactivate/delete themselves, and the last
--     active administrator of a cafe can never be removed or demoted.
--     (Before this, ANY manager could make themselves an admin.)
--
--  2. DEACTIVATED STAFF LOSE ALL ACCESS. Until now a deactivated person was
--     only blocked at the login screen — the database itself still trusted
--     them and they could read/write the cafe's data through the API.
--
--  3. NEW PERMISSIONS: 'cancel_orders' (cancel an ALREADY-BILLED order) and
--     'adjust_balances' (correct an account balance).
--        - Administrator: both.        - Shareholder: cancel_orders only.
--        - Manager: adjust_balances only (they do the billing, but undoing a
--          billed order is for shareholders/administrators; an administrator
--          can grant it to a specific manager).
--     Cancelling an order that has NOT been billed yet is a different action
--     (from the Orders screen) and is not affected by any of this.
--
--  4. CANCELLING IS PROTECTED. cancel_order / cancel_purchase now check the
--     permission, decide "today" themselves (in Nepal time — the caller can no
--     longer pass a fake date to reach older records), lock the row so a
--     double-tap can't reverse the money twice, and record WHO cancelled.
--
--  5. LOGIN ACTIVITY (administrator only): who opened the app, how many times,
--     on which day. Recorded through a function; nobody can read or edit the
--     table directly.
--
--  6. LOCKS UNUSED WRITE PATHS: payment rows, stock movements, purchase lines
--     and purchase payments can no longer be edited after they're written —
--     the app never edits them, only adds them.
--
--  7. PUBLIC CAFE DETAILS CLOSED. The login screen only needs to turn a cafe
--     code into a name; the phone/address/notes columns were readable by the
--     whole internet. Now only a narrow lookup function is public.
--
--  8. SAFETY RULES THE DATABASE ENFORCES: one open order per table, one open
--     shift per cafe, unique table labels, unique staff emails — plus indexes
--     so the app stays fast as history grows.
--
--  9. STOCK MATH FIX. Selling more than the recorded stock used to clamp at 0,
--     so voiding/cancelling afterwards added back MORE than was taken (stock
--     inflated). Stock can now go below zero (meaning "your count is off"),
--     so every void/cancel restores exactly what the sale took.
--
-- 10. EMAIL-VERIFIED SIGN-IN LINKING. A sign-in only claims a staff record if
--     the account's email is verified.
--
-- Safe to run more than once. If something it needs to enforce is already
-- broken in your data (a duplicate, or a cafe with no administrator), it
-- STOPS before changing anything and tells you exactly what to fix.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. PRE-FLIGHT: refuse to run if the data would break the new rules.
-- ---------------------------------------------------------------------------
do $$
declare
  v_msg text;
begin
  select string_agg(b.name, ', ') into v_msg
  from branches b
  where coalesce(b.is_active, true)
    and not exists (select 1 from staff s where s.branch_id = b.id and s.role::text = 'admin' and coalesce(s.is_active, true));
  if v_msg is not null then
    raise exception 'STOP — no active administrator in: %. Fix first (replace the email with yours): update staff set role = ''admin'' where lower(email) = ''you@gmail.com'';', v_msg;
  end if;

  select string_agg(t.table_id::text, ', ') into v_msg
  from (select table_id from orders where status in ('open', 'billing') and table_id is not null group by table_id having count(*) > 1) t;
  if v_msg is not null then
    raise exception 'STOP — these table ids each have MORE THAN ONE open order: %. Close or cancel the extra order(s) first.', v_msg;
  end if;

  select string_agg(t.branch_id::text, ', ') into v_msg
  from (select branch_id from shifts where status = 'open' group by branch_id having count(*) > 1) t;
  if v_msg is not null then
    raise exception 'STOP — these cafe ids each have MORE THAN ONE open shift: %. Close the extra shift(s) first.', v_msg;
  end if;

  select string_agg(t.label, ', ') into v_msg
  from (select min(label) as label from restaurant_tables where not is_archived group by branch_id, lower(btrim(label)) having count(*) > 1) t;
  if v_msg is not null then
    raise exception 'STOP — duplicate active table names: %. Rename or archive one of each pair first.', v_msg;
  end if;

  select string_agg(t.email, ', ') into v_msg
  from (select lower(btrim(email)) as email from staff where email is not null group by branch_id, lower(btrim(email)) having count(*) > 1) t;
  if v_msg is not null then
    raise exception 'STOP — the same email is used twice in one cafe: %. Remove or change one first.', v_msg;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 1. The new role. (Only referenced as text below, so it is safe to add and
--    use in the same script.)
-- ---------------------------------------------------------------------------
alter type staff_role add value if not exists 'shareholder';


-- ---------------------------------------------------------------------------
-- 2. Role ladder + default permissions per role. These MUST mirror
--    DEFAULT_PERMISSIONS in the app (features/staff/types.ts).
-- ---------------------------------------------------------------------------
create or replace function staff_role_rank(r staff_role) returns int
language sql immutable as $$
  select case r::text
    when 'admin' then 100
    when 'shareholder' then 80
    when 'manager' then 60
    when 'cashier' then 40
    else 20
  end
$$;

create or replace function role_default_permission(r staff_role, p_feature text) returns boolean
language sql immutable as $$
  select case r::text
    when 'admin' then true
    when 'manager' then p_feature <> 'cancel_orders'
    when 'shareholder' then p_feature not in ('staff', 'settings', 'adjust_balances')
    when 'cashier' then p_feature in ('tables', 'orders', 'billing', 'shifts', 'customers')
    when 'waiter' then p_feature in ('tables', 'orders', 'kitchen')
    when 'kitchen' then p_feature = 'kitchen'
    when 'store' then p_feature in ('inventory', 'purchasing')
    else false
  end
$$;


-- ---------------------------------------------------------------------------
-- 3. "Who is calling" helpers. Every one of them requires an ACTIVE staff
--    record — a deactivated person resolves to nothing, so every policy that
--    compares against current_staff_branch() now denies them.
-- ---------------------------------------------------------------------------
create or replace function current_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1
$$;

create or replace function current_staff_role() returns staff_role
language sql stable security definer set search_path = public as $$
  select role from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1
$$;

create or replace function current_staff_rank() returns int
language sql stable security definer set search_path = public as $$
  select coalesce(staff_role_rank(current_staff_role()), 0)
$$;

create or replace function current_staff_branch() returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1
$$;

-- An explicit per-person override always wins — EXCEPT for administrators,
-- who can never be locked out of anything (the app already treated admins
-- this way; now the database agrees).
create or replace function current_staff_has_permission(p_feature text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
  v_role staff_role;
  v_override boolean;
begin
  select id, role into v_id, v_role
  from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1;
  if v_id is null then
    return false;
  end if;

  if v_role::text = 'admin' then
    return true;
  end if;

  select allowed into v_override from permissions where staff_id = v_id and feature_key = p_feature;
  if v_override is not null then
    return v_override;
  end if;

  return role_default_permission(v_role, p_feature);
end;
$$;

create or replace function current_staff_financials_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select current_staff_has_permission('financials')
$$;

-- May the caller manage THIS staff member? Needs the 'staff' permission, the
-- same cafe, and a strictly higher rank than the target (administrators may
-- manage anyone in their cafe).
create or replace function can_manage_staff_member(p_staff_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff t
    where t.id = p_staff_id
      and t.branch_id = current_staff_branch()
      and current_staff_has_permission('staff')
      and (current_staff_role()::text = 'admin' or staff_role_rank(t.role) < current_staff_rank())
  )
$$;


-- ---------------------------------------------------------------------------
-- 4. Staff + permissions policies with the hierarchy built in.
-- ---------------------------------------------------------------------------
drop policy if exists "staff can view their branch staff" on staff;
drop policy if exists "staff-permitted staff can add their branch staff" on staff;
drop policy if exists "staff-permitted staff can edit their branch staff" on staff;
drop policy if exists "staff-permitted staff can remove their branch staff" on staff;
drop policy if exists "hierarchy: add staff below your own level" on staff;
drop policy if exists "hierarchy: edit staff below your own level" on staff;
drop policy if exists "hierarchy: remove staff below your own level" on staff;

create policy "staff can view their branch staff" on staff for select
  using (branch_id = current_staff_branch());
create policy "hierarchy: add staff below your own level" on staff for insert
  with check (
    branch_id = current_staff_branch()
    and auth_user_id is null
    and current_staff_has_permission('staff')
    and (current_staff_role()::text = 'admin' or staff_role_rank(role) < current_staff_rank())
  );
create policy "hierarchy: edit staff below your own level" on staff for update
  using (can_manage_staff_member(id))
  with check (
    branch_id = current_staff_branch()
    and current_staff_has_permission('staff')
    and (current_staff_role()::text = 'admin' or staff_role_rank(role) < current_staff_rank())
  );
create policy "hierarchy: remove staff below your own level" on staff for delete
  using (can_manage_staff_member(id));

drop policy if exists "staff can view their branch permissions" on permissions;
drop policy if exists "staff-permitted staff can set their branch permissions" on permissions;
drop policy if exists "staff-permitted staff can edit their branch permissions" on permissions;
drop policy if exists "staff-permitted staff can remove their branch permissions" on permissions;
drop policy if exists "hierarchy: set permissions below your own level" on permissions;
drop policy if exists "hierarchy: edit permissions below your own level" on permissions;
drop policy if exists "hierarchy: remove permissions below your own level" on permissions;

create policy "staff can view their branch permissions" on permissions for select
  using (exists (select 1 from staff where staff.id = permissions.staff_id and staff.branch_id = current_staff_branch()));
create policy "hierarchy: set permissions below your own level" on permissions for insert
  with check (can_manage_staff_member(staff_id));
create policy "hierarchy: edit permissions below your own level" on permissions for update
  using (can_manage_staff_member(staff_id))
  with check (can_manage_staff_member(staff_id));
create policy "hierarchy: remove permissions below your own level" on permissions for delete
  using (can_manage_staff_member(staff_id));

-- Guard rails no policy can express: nobody edits their own standing, the
-- sign-in link can't be rewired by hand, and a cafe can't lose its last
-- administrator. Only requests coming through the app's API are restricted —
-- SQL run from the Supabase SQL editor (and the app's own link function)
-- still work, so you can always fix things manually.
create or replace function staff_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  v_other_admins int;
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'A staff member''s sign-in link is set automatically the first time they sign in — it can''t be edited by hand.';
    end if;
    if new.branch_id is distinct from old.branch_id then
      raise exception 'A staff member can''t be moved to another cafe.';
    end if;
    if old.auth_user_id is not null and old.auth_user_id = auth.uid() then
      if new.role is distinct from old.role then
        raise exception 'You can''t change your own role.';
      end if;
      if coalesce(old.is_active, true) and not coalesce(new.is_active, true) then
        raise exception 'You can''t deactivate your own account.';
      end if;
    end if;
    if old.role::text = 'admin' and coalesce(old.is_active, true)
       and (new.role::text <> 'admin' or not coalesce(new.is_active, true)) then
      select count(*) into v_other_admins from staff
      where branch_id = old.branch_id and role::text = 'admin' and coalesce(is_active, true) and id <> old.id;
      if v_other_admins = 0 then
        raise exception 'This is the last active administrator of the cafe — make someone else an administrator first.';
      end if;
    end if;
    return new;
  end if;

  -- DELETE
  if old.auth_user_id is not null and old.auth_user_id = auth.uid() then
    raise exception 'You can''t remove your own account.';
  end if;
  if old.role::text = 'admin' and coalesce(old.is_active, true) then
    select count(*) into v_other_admins from staff
    where branch_id = old.branch_id and role::text = 'admin' and coalesce(is_active, true) and id <> old.id;
    if v_other_admins = 0 then
      raise exception 'This is the last active administrator of the cafe — it can''t be removed.';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_staff_guard on staff;
create trigger trg_staff_guard before update or delete on staff
  for each row execute function staff_guard();


-- ---------------------------------------------------------------------------
-- 5. Sign-in linking: only for a VERIFIED email.
-- ---------------------------------------------------------------------------
create or replace function link_staff_account(p_code text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null) then
    return;
  end if;

  update staff
  set auth_user_id = auth.uid()
  where auth_user_id is null
    and email is not null
    and lower(btrim(email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    and (p_code is null or branch_id = (select id from branches where lower(code) = lower(btrim(p_code))));
end;
$$;


-- ---------------------------------------------------------------------------
-- 6. Login activity (administrator only).
-- ---------------------------------------------------------------------------
create table if not exists login_events (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references branches(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  seen_at timestamptz not null default now()
);
create index if not exists login_events_branch_seen_idx on login_events (branch_id, seen_at desc);
create index if not exists login_events_staff_seen_idx on login_events (staff_id, seen_at desc);

-- RLS on with NO policies + no grants: the table can't be read or written
-- directly by anyone using the API. Only the functions below touch it.
alter table login_events enable row level security;
revoke all on login_events from anon, authenticated;

-- Called by the app each time it opens signed in. Several opens within 30
-- minutes count as one visit.
create or replace function record_login_event() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
begin
  select id, branch_id into v_staff_id, v_branch_id
  from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1;
  if v_staff_id is null then
    return;
  end if;
  if exists (select 1 from login_events where staff_id = v_staff_id and seen_at > now() - interval '30 minutes') then
    return;
  end if;
  insert into login_events (branch_id, staff_id) values (v_branch_id, v_staff_id);
end;
$$;

-- One row per person per Nepal day, only days with at least one visit.
create or replace function login_activity(p_from date, p_to date)
returns table (staff_id uuid, staff_name text, role text, day date, visits int, first_seen timestamptz, last_seen timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if current_staff_role()::text is distinct from 'admin' then
    raise exception 'Login activity is visible to the administrator only.';
  end if;
  return query
  select s.id, s.name, s.role::text,
         (e.seen_at at time zone 'Asia/Kathmandu')::date as day,
         count(*)::int, min(e.seen_at), max(e.seen_at)
  from login_events e
  join staff s on s.id = e.staff_id
  where e.branch_id = current_staff_branch()
    and (e.seen_at at time zone 'Asia/Kathmandu')::date between p_from and p_to
  group by s.id, s.name, s.role, (e.seen_at at time zone 'Asia/Kathmandu')::date
  order by day desc, s.name;
end;
$$;

-- Last time each person was ever seen (all time).
create or replace function login_last_seen()
returns table (staff_id uuid, last_seen timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if current_staff_role()::text is distinct from 'admin' then
    raise exception 'Login activity is visible to the administrator only.';
  end if;
  return query
  select e.staff_id, max(e.seen_at) from login_events e
  where e.branch_id = current_staff_branch() group by e.staff_id;
end;
$$;

revoke all on function record_login_event() from public, anon;
revoke all on function login_activity(date, date) from public, anon;
revoke all on function login_last_seen() from public, anon;
grant execute on function record_login_event() to authenticated;
grant execute on function login_activity(date, date) to authenticated;
grant execute on function login_last_seen() to authenticated;


-- ---------------------------------------------------------------------------
-- 7. Cancelling: permission-checked, server-side "today", row-locked, and
--    signed with who did it.
-- ---------------------------------------------------------------------------
alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists cancelled_by uuid references staff(id);
alter table purchases add column if not exists cancelled_at timestamptz;
alter table purchases add column if not exists cancelled_by uuid references staff(id);

create or replace function cancel_purchase(p_purchase_id uuid, p_local_day_start timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_day_start timestamptz;
  v_purchase purchases%rowtype;
  v_line record;
  v_payment record;
  v_lines_total numeric;
  v_paid_total numeric;
  v_shortfall numeric;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;
  if not current_staff_has_permission('purchasing') then
    raise exception 'you don''t have permission to cancel purchases';
  end if;

  v_branch_id := current_staff_branch();
  -- "Today" is decided here in Nepal time; whatever the caller passes can
  -- only make it stricter, never reach further back.
  v_day_start := greatest(
    coalesce(p_local_day_start, '-infinity'::timestamptz),
    date_trunc('day', now() at time zone 'Asia/Kathmandu') at time zone 'Asia/Kathmandu'
  );

  -- Locked, so two people cancelling the same purchase at once can't both refund it.
  select * into v_purchase from purchases where id = p_purchase_id and branch_id = v_branch_id for update;
  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;

  if v_purchase.status = 'cancelled' then
    raise exception 'purchase is already cancelled';
  end if;

  if v_purchase.created_at < v_day_start then
    raise exception 'only a purchase from today can be cancelled';
  end if;

  if v_purchase.status = 'received' then
    for v_line in
      select inventory_item_id, quantity, description from purchase_lines
      where purchase_id = p_purchase_id and kind = 'inventory' and inventory_item_id is not null
    loop
      update inventory_items set current_stock = current_stock - v_line.quantity where id = v_line.inventory_item_id;
      insert into stock_movements (inventory_item_id, type, quantity, note, created_by)
      values (v_line.inventory_item_id, 'adjustment', -v_line.quantity, 'Purchase cancelled: ' || v_line.description, v_staff_id);
    end loop;
  end if;

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

  select coalesce(sum(quantity * unit_cost), 0) into v_lines_total from purchase_lines where purchase_id = p_purchase_id;
  select coalesce(sum(amount), 0) into v_paid_total from purchase_payments where purchase_id = p_purchase_id;
  v_shortfall := greatest(0, v_lines_total - v_paid_total);

  if v_shortfall > 0 and v_purchase.supplier_id is not null then
    update suppliers set outstanding_balance = greatest(0, outstanding_balance - v_shortfall) where id = v_purchase.supplier_id;
  end if;

  update purchases set status = 'cancelled', cancelled_at = now(), cancelled_by = v_staff_id where id = p_purchase_id;
end;
$$;

create or replace function cancel_order(p_order_id uuid, p_local_day_start timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_day_start timestamptz;
  v_order orders%rowtype;
  v_item record;
  v_payment record;
  v_paid_total numeric;
  v_change_given numeric;
  v_others_merged_in boolean;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;
  if not current_staff_has_permission('cancel_orders') then
    raise exception 'you don''t have permission to cancel paid orders';
  end if;

  v_branch_id := current_staff_branch();
  v_day_start := greatest(
    coalesce(p_local_day_start, '-infinity'::timestamptz),
    date_trunc('day', now() at time zone 'Asia/Kathmandu') at time zone 'Asia/Kathmandu'
  );

  -- Locked, so a double-tap (or two devices) can't reverse the money twice.
  select * into v_order from orders where id = p_order_id and branch_id = v_branch_id for update;
  if v_order.id is null then
    raise exception 'order not found';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'only a completed (paid) order can be cancelled this way — for an order still open or being billed, use Cancel from the table instead';
  end if;

  if v_order.closed_at is null or v_order.closed_at < v_day_start then
    raise exception 'only an order closed today can be cancelled';
  end if;

  if v_order.merged_into_order_id is not null then
    raise exception 'this order was merged into another bill — cancel that one instead';
  end if;

  select exists(select 1 from orders where merged_into_order_id = p_order_id) into v_others_merged_in;
  if v_others_merged_in then
    raise exception 'other orders were merged into this bill — this can''t be cleanly undone automatically, please correct it manually';
  end if;

  -- Undo tracked inventory (1:1 items like beer/liquor sold directly).
  for v_item in
    select oi.quantity, mi.tracked_inventory_item_id, coalesce(oi.custom_name, mi.name) as item_name
    from order_items oi
    left join menu_items mi on mi.id = oi.menu_item_id
    where oi.order_id = p_order_id and oi.status <> 'void' and mi.tracked_inventory_item_id is not null
  loop
    update inventory_items set current_stock = current_stock + v_item.quantity where id = v_item.tracked_inventory_item_id;
    insert into stock_movements (inventory_item_id, type, quantity, note, created_by)
    values (v_item.tracked_inventory_item_id, 'adjustment', v_item.quantity, 'Order cancelled: ' || v_item.item_name, v_staff_id);
  end loop;

  -- Undo the money: each payment collected for this order is withdrawn back
  -- out of the account it was deposited into.
  select coalesce(sum(amount), 0) into v_paid_total from payments where order_id = p_order_id;

  for v_payment in
    select p.amount, a.id as account_id
    from payments p
    join accounts a on a.payment_method_id = p.payment_method_id and a.branch_id = v_branch_id
    where p.order_id = p_order_id
  loop
    update accounts set balance = balance - v_payment.amount where id = v_payment.account_id;
    insert into ledger_entries (account_id, amount, reason, order_id, created_by)
    values (v_payment.account_id, -v_payment.amount, 'order cancelled', p_order_id, v_staff_id);
  end loop;

  -- If change was given out at completion (paid more than the bill), that
  -- cash needs to come back since the whole transaction is being undone.
  v_change_given := greatest(0, v_paid_total - v_order.total);
  if v_change_given > 0 then
    declare v_cash_account_id uuid;
    begin
      select a.id into v_cash_account_id
      from accounts a join payment_methods pm on pm.id = a.payment_method_id
      where pm.key = 'cash' and a.branch_id = v_branch_id;
      if v_cash_account_id is not null then
        update accounts set balance = balance + v_change_given where id = v_cash_account_id;
        insert into ledger_entries (account_id, amount, reason, order_id, created_by)
        values (v_cash_account_id, v_change_given, 'order cancelled: change reversed', p_order_id, v_staff_id);
      end if;
    end;
  end if;

  -- Undo the customer's due/lifetime-spend/loyalty effect from this order.
  if v_order.customer_id is not null then
    update customers
    set
      lifetime_spend = greatest(0, lifetime_spend - v_order.total),
      loyalty_points = greatest(0, loyalty_points - round(v_order.total / 100)),
      outstanding_due = greatest(0, outstanding_due - coalesce(v_order.due_amount, 0)),
      due_since = case when greatest(0, outstanding_due - coalesce(v_order.due_amount, 0)) = 0 then null else due_since end
    where id = v_order.customer_id;
  end if;

  update order_items set status = 'void', void_reason = 'Order cancelled', status_updated_at = now()
  where order_id = p_order_id and status <> 'void';

  update orders set status = 'cancelled', cancelled_at = now(), cancelled_by = v_staff_id where id = p_order_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. Correcting an account balance needs the 'adjust_balances' permission.
--    (Same function body as before — only the guard at the top is new.)
-- ---------------------------------------------------------------------------
create or replace function increment_balance(p_account_id uuid, p_delta numeric, p_reason text, p_order_id uuid default null, p_purchase_id uuid default null)
returns numeric
language plpgsql security invoker as $$
declare
  v_staff_id uuid;
  v_new_balance numeric;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and coalesce(is_active, true) limit 1;

  if p_reason like 'Balance adjustment%' and not current_staff_has_permission('adjust_balances') then
    raise exception 'you don''t have permission to correct account balances';
  end if;

  update accounts set balance = balance + p_delta where id = p_account_id
  returning balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'account not found';
  end if;

  insert into ledger_entries (account_id, amount, reason, order_id, purchase_id, created_by)
  values (p_account_id, p_delta, p_reason, p_order_id, p_purchase_id, v_staff_id);

  return v_new_balance;
end;
$$;


-- ---------------------------------------------------------------------------
-- 9. Stock math: allow the count to go below zero so voids/cancels restore
--    exactly what a sale took (no more phantom stock).
-- ---------------------------------------------------------------------------
create or replace function increment_stock(p_item_id uuid, p_delta numeric, p_type text, p_note text default null)
returns numeric
language plpgsql security invoker as $$
declare
  v_new_stock numeric;
begin
  update inventory_items set current_stock = current_stock + p_delta where id = p_item_id
  returning current_stock into v_new_stock;

  if v_new_stock is null then
    raise exception 'inventory item not found';
  end if;

  insert into stock_movements (inventory_item_id, type, quantity, note, created_by)
  values (p_item_id, p_type::stock_movement_type, p_delta, p_note, current_staff_id());

  return v_new_stock;
end;
$$;


-- ---------------------------------------------------------------------------
-- 10. Records that are only ever ADDED can no longer be edited.
-- ---------------------------------------------------------------------------
drop policy if exists "staff can edit their branch payments" on payments;
drop policy if exists "staff can edit their branch stock_movements" on stock_movements;
drop policy if exists "staff can edit their branch purchase_lines" on purchase_lines;
drop policy if exists "staff can edit their branch purchase_payments" on purchase_payments;


-- ---------------------------------------------------------------------------
-- 11. Public login lookup: a code -> name only. The rest of the cafe's row
--     (phone, address, notes...) is no longer readable without signing in.
-- ---------------------------------------------------------------------------
drop policy if exists "anyone can look up a branch by its code" on branches;

create or replace function lookup_branch_by_code(p_code text)
returns table (id uuid, name text, code text)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.code from branches b
  where lower(b.code) = lower(btrim(p_code)) and coalesce(b.is_active, true)
  limit 1
$$;

revoke all on function lookup_branch_by_code(text) from public;
grant execute on function lookup_branch_by_code(text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 12. Rules the database itself enforces, plus speed.
-- ---------------------------------------------------------------------------
create unique index if not exists orders_one_open_per_table
  on orders (table_id) where status in ('open', 'billing') and table_id is not null;
create unique index if not exists shifts_one_open_per_branch
  on shifts (branch_id) where status = 'open';
create unique index if not exists restaurant_tables_label_unique
  on restaurant_tables (branch_id, lower(btrim(label))) where not is_archived;
create unique index if not exists staff_email_unique_per_branch
  on staff (branch_id, lower(btrim(email))) where email is not null;

create index if not exists orders_branch_status_idx on orders (branch_id, status);
create index if not exists orders_branch_closed_idx on orders (branch_id, closed_at desc) where status = 'paid';
create index if not exists orders_table_idx on orders (table_id);
create index if not exists orders_shift_idx on orders (shift_id);
create index if not exists orders_customer_idx on orders (customer_id);
create index if not exists orders_merged_into_idx on orders (merged_into_order_id) where merged_into_order_id is not null;
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_menu_item_idx on order_items (menu_item_id);
create index if not exists payments_order_idx on payments (order_id);
create index if not exists ledger_entries_account_created_idx on ledger_entries (account_id, created_at desc);
create index if not exists ledger_entries_order_idx on ledger_entries (order_id) where order_id is not null;
create index if not exists ledger_entries_purchase_idx on ledger_entries (purchase_id) where purchase_id is not null;
create index if not exists stock_movements_item_created_idx on stock_movements (inventory_item_id, created_at desc);
create index if not exists purchases_branch_created_idx on purchases (branch_id, created_at desc);
create index if not exists purchase_lines_purchase_idx on purchase_lines (purchase_id);
create index if not exists purchase_lines_inventory_idx on purchase_lines (inventory_item_id) where inventory_item_id is not null;
create index if not exists purchase_payments_purchase_idx on purchase_payments (purchase_id);
create index if not exists shift_balances_shift_idx on shift_balances (shift_id);
create index if not exists customers_branch_idx on customers (branch_id);
create index if not exists due_settlements_customer_idx on due_settlements (customer_id);
create index if not exists bank_ledger_branch_date_idx on bank_ledger_entries (branch_id, entry_date);
create index if not exists staff_auth_user_idx on staff (auth_user_id);
create index if not exists staff_branch_idx on staff (branch_id);
create index if not exists restaurant_tables_branch_idx on restaurant_tables (branch_id);
create index if not exists inventory_items_branch_idx on inventory_items (branch_id);
create index if not exists menu_items_branch_idx on menu_items (branch_id);

-- Make the new functions visible to the app right away.
notify pgrst, 'reload schema';
