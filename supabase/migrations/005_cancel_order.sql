-- ============================================================================
-- Migration 005 — cancel a completed (paid) order from today, reversing
-- the money it moved, any tracked inventory it deducted, and its effect on
-- the attached customer's due/lifetime spend/loyalty points. Built for
-- fixing same-day mistakes like a duplicate order entered twice — not a
-- general-purpose "undo any order ever" tool, on purpose.
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

create or replace function cancel_order(p_order_id uuid, p_local_day_start timestamptz)
returns void
language plpgsql security definer as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_order orders%rowtype;
  v_item record;
  v_payment record;
  v_paid_total numeric;
  v_change_given numeric;
  v_due_contribution numeric;
  v_others_merged_in boolean;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;

  v_branch_id := current_staff_branch();

  select * into v_order from orders where id = p_order_id and branch_id = v_branch_id;
  if v_order.id is null then
    raise exception 'order not found';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'only a completed (paid) order can be cancelled this way — for an order still open or being billed, use Cancel from the table instead';
  end if;

  if v_order.closed_at is null or v_order.closed_at < p_local_day_start then
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

  -- Undo the money: each payment collected for this order gets withdrawn
  -- back out of the account it was deposited into.
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

  -- Undo the customer's due/lifetime-spend/loyalty effect from this order,
  -- floored at zero so it can't push their numbers negative if they've
  -- settled part of their due since this order happened.
  if v_order.customer_id is not null then
    v_due_contribution := greatest(0, v_order.total - v_paid_total);
    update customers
    set
      lifetime_spend = greatest(0, lifetime_spend - v_order.total),
      loyalty_points = greatest(0, loyalty_points - round(v_order.total / 100)),
      outstanding_due = greatest(0, outstanding_due - v_due_contribution),
      due_since = case when greatest(0, outstanding_due - v_due_contribution) = 0 then null else due_since end
    where id = v_order.customer_id;
  end if;

  update order_items set status = 'void', void_reason = 'Order cancelled', status_updated_at = now()
  where order_id = p_order_id and status <> 'void';

  update orders set status = 'cancelled' where id = p_order_id;
end;
$$;

grant execute on function cancel_order(uuid, timestamptz) to authenticated;
