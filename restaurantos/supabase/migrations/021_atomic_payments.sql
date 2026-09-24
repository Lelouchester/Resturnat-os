-- ============================================================================
-- 021_atomic_payments.sql
--
-- What this does, in plain terms:
--
-- Billing a table used to be about 8 separate requests from the app, one
-- after another: save the payment, deposit into the account, log the
-- change given, close the order, close any merged orders, free the
-- table(s), update the customer's due balance. If the connection dropped
-- or the app hiccupped partway through, some of those could succeed and
-- others fail — with nothing to undo the ones that already happened. That
-- is the exact cause of the payment/Accounts mismatches found in the
-- owner's real data (duplicate payments, deposits that never landed,
-- change never recorded).
--
-- This migration moves the whole thing into THREE functions, each of
-- which is one single database transaction — it either completely
-- happens or completely doesn't, with nothing left half-done:
--
--   complete_payment()      finishes a bill: payment(s), deposit, change,
--                            closing the order (+ any merged orders),
--                            freeing the table(s), and the customer's
--                            due/lifetime-spend/loyalty update.
--   record_order_payment()  a partial payment while the table is still
--                            open (deposits the money now; doesn't touch
--                            the order's status).
--   close_no_charge_order() closes a staff/no-charge table (no money
--                            moves, but still needs to be locked and
--                            permission-checked the same way).
--
-- Each: requires the 'billing' permission, locks the order row so two
-- devices can't both finish the same bill, and refuses cleanly (with a
-- message the app can show) if the order was already settled.
--
-- Idempotent — safe to paste into the SQL editor, safe to run twice.
-- ============================================================================


-- Shared helper: turn {"key": "cash", "amount": 500} JSON rows into real
-- payments — inserted, deposited, and ledgered — and hand back how much
-- was actually recorded. Used by both complete_payment and
-- record_order_payment so the two can't drift apart.
create or replace function apply_order_payments(p_order_id uuid, p_branch_id uuid, p_staff_id uuid, p_payments jsonb)
returns numeric
language plpgsql as $$
declare
  v_elem jsonb;
  v_key text;
  v_amount numeric;
  v_method_id uuid;
  v_account_id uuid;
  v_total numeric := 0;
begin
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    return 0;
  end if;

  for v_elem in select * from jsonb_array_elements(p_payments) loop
    v_key := v_elem ->> 'key';
    v_amount := nullif(v_elem ->> 'amount', '')::numeric;
    if v_key is null or v_amount is null or v_amount <= 0 then
      continue;
    end if;

    select id into v_method_id from payment_methods where branch_id = p_branch_id and key = v_key;
    if v_method_id is null then
      raise exception 'Unknown payment method "%" for this cafe.', v_key;
    end if;

    select id into v_account_id from accounts where branch_id = p_branch_id and payment_method_id = v_method_id;
    if v_account_id is null then
      raise exception 'No account is set up for payment method "%".', v_key;
    end if;

    insert into payments (order_id, payment_method_id, amount) values (p_order_id, v_method_id, v_amount);
    update accounts set balance = balance + v_amount where id = v_account_id;
    insert into ledger_entries (account_id, amount, reason, order_id, created_by)
    values (v_account_id, v_amount, 'order payment', p_order_id, p_staff_id);

    v_total := v_total + v_amount;
  end loop;

  return v_total;
end;
$$;


create or replace function complete_payment(
  p_order_id uuid,
  p_payments jsonb,                    -- '[{"key":"cash","amount":500}, ...]'
  p_merged_order_ids uuid[] default '{}',
  p_customer_id uuid default null,
  p_subtotal numeric default 0,
  p_discount_amount numeric default 0,
  p_service_charge numeric default 0,
  p_tax_amount numeric default 0,
  p_tip_amount numeric default 0,
  p_total numeric default 0,
  p_split_guest_count int default 1,
  p_remark text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_order orders%rowtype;
  v_merged_id uuid;
  v_merged_status order_status;
  v_prior_paid numeric;
  v_new_paid numeric;
  v_change_given numeric;
  v_due_amount numeric;
  v_cash_account_id uuid;
  v_table_ids uuid[];
  v_customer customers%rowtype;
  v_due_delta numeric;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;
  if not current_staff_has_permission('billing') then
    raise exception 'you don''t have permission to take payments';
  end if;
  v_branch_id := current_staff_branch();

  if p_total < 0 then
    raise exception 'the bill total can''t be negative';
  end if;

  -- Locked, so two devices finishing the same bill at once can't both
  -- succeed (the second sees it's no longer open and stops cleanly).
  select * into v_order from orders where id = p_order_id and branch_id = v_branch_id for update;
  if v_order.id is null then
    raise exception 'order not found';
  end if;
  if v_order.status not in ('open', 'billing') then
    raise exception 'This order is already % — it can''t be billed again. If this bill needs correcting, use Cancel/Reverse instead.', v_order.status;
  end if;

  -- Every merged order must genuinely belong to this bill and still be
  -- open — otherwise this would silently "complete" someone else's order.
  foreach v_merged_id in array coalesce(p_merged_order_ids, '{}') loop
    select status into v_merged_status from orders where id = v_merged_id and branch_id = v_branch_id and merged_into_order_id = p_order_id for update;
    if v_merged_status is null then
      raise exception 'one of the merged tables no longer matches this bill — please refresh and try again';
    end if;
    if v_merged_status not in ('open', 'billing') then
      raise exception 'one of the merged tables was already settled separately — please refresh and try again';
    end if;
  end loop;

  select coalesce(sum(amount), 0) into v_prior_paid from payments where order_id = p_order_id;

  v_new_paid := apply_order_payments(p_order_id, v_branch_id, v_staff_id, p_payments);

  -- Money paid beyond the bill is handed back as physical cash, whichever
  -- method it came in on — see the long-standing comment in accountsStore
  -- for why this always draws from the Cash account.
  v_change_given := greatest(0, v_prior_paid + v_new_paid - p_total);
  if v_change_given > 0 then
    select a.id into v_cash_account_id
    from accounts a join payment_methods pm on pm.id = a.payment_method_id
    where pm.key = 'cash' and a.branch_id = v_branch_id;
    if v_cash_account_id is null then
      raise exception 'no Cash account is set up for this cafe — can''t give change';
    end if;
    update accounts set balance = balance - v_change_given where id = v_cash_account_id;
    insert into ledger_entries (account_id, amount, reason, order_id, created_by)
    values (v_cash_account_id, -v_change_given, 'Change given to customer', p_order_id, v_staff_id);
  end if;

  v_due_amount := greatest(0, p_total - v_prior_paid - v_new_paid);

  update orders set
    status = 'paid',
    closed_at = now(),
    customer_id = p_customer_id,
    subtotal = p_subtotal,
    discount_amount = p_discount_amount,
    service_charge = p_service_charge,
    tax_amount = p_tax_amount,
    tip_amount = p_tip_amount,
    total = p_total,
    split_guest_count = p_split_guest_count,
    due_amount = v_due_amount,
    billing_remark = nullif(btrim(coalesce(p_remark, '')), '')
  where id = p_order_id;

  if array_length(p_merged_order_ids, 1) > 0 then
    update orders set status = 'paid', closed_at = now() where id = any(p_merged_order_ids);
  end if;

  select array_agg(distinct table_id) into v_table_ids
  from orders where id = p_order_id or id = any(coalesce(p_merged_order_ids, '{}'));

  if v_table_ids is not null then
    update restaurant_tables
    set status = 'needs_cleaning', customer_name = null, customer_phone = null, customer_id = null, guest_count = null, seated_at = null, note = null
    where id = any(v_table_ids);
  end if;

  if p_customer_id is not null then
    select * into v_customer from customers where id = p_customer_id and branch_id = v_branch_id for update;
    if v_customer.id is not null then
      v_due_delta := v_due_amount; -- unpaid part of THIS bill, same figure applyPayment() used client-side
      update customers set
        lifetime_spend = lifetime_spend + p_total,
        loyalty_points = loyalty_points + round(p_total / 100),
        outstanding_due = greatest(0, outstanding_due + v_due_delta),
        due_since = case when v_customer.outstanding_due = 0 and v_due_delta > 0 then now() else v_customer.due_since end
      where id = p_customer_id;
    end if;
  end if;

  return jsonb_build_object('due_amount', v_due_amount, 'change_given', v_change_given, 'total_paid', v_prior_paid + v_new_paid);
end;
$$;

revoke all on function complete_payment(uuid, jsonb, uuid[], uuid, numeric, numeric, numeric, numeric, numeric, numeric, int, text) from public, anon;
grant execute on function complete_payment(uuid, jsonb, uuid[], uuid, numeric, numeric, numeric, numeric, numeric, numeric, int, text) to authenticated;


-- A payment collected while the table is still open (before the final
-- bill) — deliberately does not touch the order's status, due_amount, or
-- the table.
create or replace function record_order_payment(p_order_id uuid, p_payments jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_status order_status;
  v_paid numeric;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;
  if not current_staff_has_permission('billing') then
    raise exception 'you don''t have permission to take payments';
  end if;
  v_branch_id := current_staff_branch();

  select status into v_status from orders where id = p_order_id and branch_id = v_branch_id for update;
  if v_status is null then
    raise exception 'order not found';
  end if;
  if v_status not in ('open', 'billing') then
    raise exception 'This order is already % — a payment can''t be added to it.', v_status;
  end if;

  v_paid := apply_order_payments(p_order_id, v_branch_id, v_staff_id, p_payments);
  return jsonb_build_object('total_paid', v_paid);
end;
$$;

revoke all on function record_order_payment(uuid, jsonb) from public, anon;
grant execute on function record_order_payment(uuid, jsonb) to authenticated;


-- Closes a staff / no-charge table. No money moves, but it needs the same
-- permission check and row lock as a real bill so two devices (or a
-- double-tap) can't both close it, and so it can't silently overwrite an
-- order that was, in the meantime, billed normally instead.
create or replace function close_no_charge_order(
  p_order_id uuid,
  p_merged_order_ids uuid[] default '{}',
  p_subtotal numeric default 0,
  p_total numeric default 0,
  p_remark text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_status order_status;
  v_table_ids uuid[];
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and coalesce(is_active, true) order by created_at limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;
  if not current_staff_has_permission('billing') then
    raise exception 'you don''t have permission to close orders';
  end if;
  v_branch_id := current_staff_branch();

  select status into v_status from orders where id = p_order_id and branch_id = v_branch_id for update;
  if v_status is null then
    raise exception 'order not found';
  end if;
  if v_status in ('paid', 'cancelled') then
    raise exception 'This order is already closed — refresh and check before trying again.';
  end if;

  update orders set
    status = 'paid', closed_at = now(), subtotal = p_subtotal, discount_amount = 0, service_charge = 0,
    tax_amount = 0, tip_amount = 0, total = p_total, due_amount = 0, is_staff_order = true,
    billing_remark = nullif(btrim(coalesce(p_remark, '')), '')
  where id = p_order_id;

  if array_length(p_merged_order_ids, 1) > 0 then
    update orders set status = 'paid', closed_at = now(), due_amount = 0, is_staff_order = true where id = any(p_merged_order_ids);
  end if;

  select array_agg(distinct table_id) into v_table_ids
  from orders where id = p_order_id or id = any(coalesce(p_merged_order_ids, '{}'));

  if v_table_ids is not null then
    update restaurant_tables
    set status = 'needs_cleaning', customer_name = null, customer_phone = null, customer_id = null, guest_count = null, seated_at = null, note = null
    where id = any(v_table_ids);
  end if;
end;
$$;

revoke all on function close_no_charge_order(uuid, uuid[], numeric, numeric, text) from public, anon;
grant execute on function close_no_charge_order(uuid, uuid[], numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';
