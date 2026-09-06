-- ============================================================================
-- Migration 008 — allow editing or removing a bank ledger entry, without
-- giving up the audit trail. The entry itself can now be changed, but every
-- change first writes the entry's PREVIOUS values into a permanent history
-- log before touching it — so nothing is ever silently rewritten. A removed
-- entry is soft-deleted (flagged, not actually gone), stays visible with
-- its history, and drops out of the running balance.
--
-- Both actions only exist as database functions below, not as raw table
-- update/delete access — that's what guarantees the history log can never
-- be skipped by a future code path, same pattern as cancel_purchase and
-- cancel_order. Still gated to financials-permitted staff only.
--
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

alter table bank_ledger_entries add column if not exists edited_at timestamptz;
alter table bank_ledger_entries add column if not exists edited_by uuid references staff(id);
alter table bank_ledger_entries add column if not exists deleted_at timestamptz;
alter table bank_ledger_entries add column if not exists deleted_by uuid references staff(id);

create table if not exists bank_ledger_entry_history (
  id uuid primary key default uuid_generate_v4(),
  entry_id uuid references bank_ledger_entries(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  change_type text not null, -- 'edit' or 'delete'
  previous_entry_date date not null,
  previous_amount numeric(12,2) not null,
  previous_remark text not null,
  changed_by uuid references staff(id),
  changed_at timestamptz default now()
);

alter table bank_ledger_entry_history enable row level security;

drop policy if exists "financials-permitted staff can view their branch bank ledger history" on bank_ledger_entry_history;
create policy "financials-permitted staff can view their branch bank ledger history" on bank_ledger_entry_history for select
  using (branch_id = current_staff_branch() and current_staff_financials_ok());
-- Deliberately no insert/update/delete policy — only the two functions
-- below (security definer) ever write here.

create or replace function edit_bank_ledger_entry(p_entry_id uuid, p_new_entry_date date, p_new_amount numeric, p_new_remark text)
returns void
language plpgsql security definer as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_entry bank_ledger_entries%rowtype;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;
  if not current_staff_financials_ok() then
    raise exception 'not permitted to edit the bank ledger';
  end if;

  v_branch_id := current_staff_branch();

  select * into v_entry from bank_ledger_entries where id = p_entry_id and branch_id = v_branch_id;
  if v_entry.id is null then
    raise exception 'entry not found';
  end if;
  if v_entry.deleted_at is not null then
    raise exception 'this entry was deleted — add a new entry instead of editing a deleted one';
  end if;
  if p_new_remark is null or length(trim(p_new_remark)) = 0 then
    raise exception 'a remark is required';
  end if;

  insert into bank_ledger_entry_history (entry_id, branch_id, change_type, previous_entry_date, previous_amount, previous_remark, changed_by)
  values (p_entry_id, v_branch_id, 'edit', v_entry.entry_date, v_entry.amount, v_entry.remark, v_staff_id);

  update bank_ledger_entries
  set entry_date = p_new_entry_date, amount = p_new_amount, remark = trim(p_new_remark), edited_at = now(), edited_by = v_staff_id
  where id = p_entry_id;
end;
$$;

grant execute on function edit_bank_ledger_entry(uuid, date, numeric, text) to authenticated;

create or replace function delete_bank_ledger_entry(p_entry_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_entry bank_ledger_entries%rowtype;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;
  if not current_staff_financials_ok() then
    raise exception 'not permitted to remove entries from the bank ledger';
  end if;

  v_branch_id := current_staff_branch();

  select * into v_entry from bank_ledger_entries where id = p_entry_id and branch_id = v_branch_id;
  if v_entry.id is null then
    raise exception 'entry not found';
  end if;
  if v_entry.deleted_at is not null then
    raise exception 'already deleted';
  end if;

  insert into bank_ledger_entry_history (entry_id, branch_id, change_type, previous_entry_date, previous_amount, previous_remark, changed_by)
  values (p_entry_id, v_branch_id, 'delete', v_entry.entry_date, v_entry.amount, v_entry.remark, v_staff_id);

  update bank_ledger_entries set deleted_at = now(), deleted_by = v_staff_id where id = p_entry_id;
end;
$$;

grant execute on function delete_bank_ledger_entry(uuid) to authenticated;
