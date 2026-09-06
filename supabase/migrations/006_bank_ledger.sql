-- ============================================================================
-- Migration 006 — a manual bank reconciliation ledger, separate from the
-- POS's own internal "Bank" account. That internal account only reflects
-- money moved through transferFunds() inside the app; this ledger is for
-- the real bank statement figure, kept by hand — opening balance, then
-- debit/credit entries with a remark for each, matching what actually
-- happened at the bank (deposits, withdrawals, charges, interest, whatever
-- never passes through the POS at all).
--
-- Deliberately append-only: no update or delete policy exists for this
-- table at all, on purpose. A mistake gets corrected with a new entry and
-- a remark explaining it, never by editing history — that's what makes the
-- audit trail (who entered what, and when) trustworthy without needing any
-- separate change-tracking machinery bolted on. Gated to staff with the
-- 'financials' permission, same as the rest of Accounts.
--
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

create table if not exists bank_ledger_entries (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  entry_date date not null, -- the real-world date of the bank transaction, not necessarily today
  amount numeric(12,2) not null, -- positive = credit/deposit, negative = debit/withdrawal
  remark text not null,
  created_by uuid references staff(id),
  created_at timestamptz default now() -- when it was actually entered into the system — the audit timestamp
);

alter table bank_ledger_entries enable row level security;

drop policy if exists "financials-permitted staff can view their branch bank ledger" on bank_ledger_entries;
create policy "financials-permitted staff can view their branch bank ledger" on bank_ledger_entries for select
  using (branch_id = current_staff_branch() and current_staff_financials_ok());

drop policy if exists "financials-permitted staff can add to their branch bank ledger" on bank_ledger_entries;
create policy "financials-permitted staff can add to their branch bank ledger" on bank_ledger_entries for insert
  with check (branch_id = current_staff_branch() and current_staff_financials_ok());

-- No update or delete policy — see the note above. This is intentional.
