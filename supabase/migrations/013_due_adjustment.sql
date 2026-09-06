-- ============================================================================
-- Migration 013 — reduce a customer's due directly, with no matching
-- payment and no effect on any account balance, for clearing out dummy
-- dues that were never real (created by a software bug, a duplicate entry
-- since fixed, etc.). Gated to staff with the 'financials' permission,
-- same as the Bank tab, and enforced at the database level inside the
-- function itself — not just hidden in the UI.
--
-- due_settlements now distinguishes 'payment' (real money, logged by
-- settleDue, insertable by any staff) from 'adjustment' (no money, logged
-- here, only ever insertable by this function — RLS blocks a direct client
-- insert of an adjustment row, closing off the obvious way this permission
-- check could otherwise be bypassed).
--
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

alter table due_settlements add column if not exists kind text not null default 'payment';
alter table due_settlements add column if not exists remark text;

drop policy if exists "staff can access their branch due settlements" on due_settlements;

drop policy if exists "staff can view their branch due settlements" on due_settlements;
create policy "staff can view their branch due settlements" on due_settlements for select
  using (branch_id = current_staff_branch());

drop policy if exists "staff can log real payments to their branch due settlements" on due_settlements;
create policy "staff can log real payments to their branch due settlements" on due_settlements for insert
  with check (branch_id = current_staff_branch() and kind = 'payment');
-- No policy permits a direct client insert with kind = 'adjustment' — only
-- adjust_customer_due() below can create one, since it's security definer
-- and bypasses RLS for its own writes.

create or replace function adjust_customer_due(p_customer_id uuid, p_amount numeric, p_remark text)
returns void
language plpgsql security definer as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_customer customers%rowtype;
  v_next_due numeric;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;
  if not current_staff_financials_ok() then
    raise exception 'not permitted to adjust customer dues';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'enter an amount greater than zero';
  end if;
  if p_remark is null or length(trim(p_remark)) = 0 then
    raise exception 'a remark is required — this reduces a due with no matching payment, so it needs to say why';
  end if;

  v_branch_id := current_staff_branch();

  select * into v_customer from customers where id = p_customer_id and branch_id = v_branch_id;
  if v_customer.id is null then
    raise exception 'customer not found';
  end if;

  v_next_due := greatest(0, v_customer.outstanding_due - p_amount);

  update customers
  set outstanding_due = v_next_due, due_since = case when v_next_due = 0 then null else due_since end
  where id = p_customer_id;

  insert into due_settlements (branch_id, customer_id, amount, payment_method_key, kind, remark, created_by)
  values (v_branch_id, p_customer_id, p_amount, null, 'adjustment', trim(p_remark), v_staff_id);
end;
$$;

grant execute on function adjust_customer_due(uuid, numeric, text) to authenticated;
