-- ============================================================================
-- Migration 010 — a dated record of every time a customer's due gets paid
-- down, so the "due statement" can show both sides: when a due was
-- incurred (already visible per-order in visit history) and when it was
-- settled. Settling stays simple — one running total per customer, reduced
-- in aggregate — this table is purely a dated log alongside that, not a
-- per-order allocation system.
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

create table if not exists due_settlements (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  amount numeric(10,2) not null,
  payment_method_key text, -- which method they paid with, if one was picked
  created_by uuid references staff(id),
  created_at timestamptz default now()
);

alter table due_settlements enable row level security;

drop policy if exists "staff can access their branch due settlements" on due_settlements;
create policy "staff can access their branch due settlements" on due_settlements for all
  using (branch_id = current_staff_branch()) with check (branch_id = current_staff_branch());
