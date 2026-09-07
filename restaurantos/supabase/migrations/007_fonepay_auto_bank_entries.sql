-- ============================================================================
-- Migration 007 — automatically post a daily Fonepay settlement to the bank
-- ledger, credit and debit, for every branch. Fonepay pays out to the real
-- bank as one lump sum per day rather than per-transaction, so this runs
-- once daily (shortly after midnight Nepal time, to close out the previous
-- day) rather than reacting to each individual payment. No commission is
-- deducted — the posted amount is the exact sum of what the app recorded.
--
-- These entries land in the same append-only ledger as manual ones, tagged
-- with a 'source' so the app can show which is which, but they follow the
-- exact same rule: once posted, never edited or deleted — a wrong number
-- gets fixed with a correcting manual entry, same as any other mistake here.
--
-- Requires the pg_cron extension, which ships enabled by default on every
-- Supabase project as of 2026 — if "create extension pg_cron" below errors
-- with a permissions message, enable it instead via Database → Extensions
-- in the Supabase dashboard, then run this migration again.
--
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

create extension if not exists pg_cron;

alter table bank_ledger_entries add column if not exists source text;

drop index if exists bank_ledger_fonepay_unique;
create unique index bank_ledger_fonepay_unique on bank_ledger_entries(branch_id, entry_date, source) where source is not null;

-- Computes and posts one branch's Fonepay credit/debit for one day.
-- security definer + owned by the migration role, so it can insert past
-- the normal financials-permission RLS check — there's no logged-in staff
-- member behind a scheduled job, so there's nothing for that check to pass.
create or replace function post_daily_fonepay_entries_for_branch(p_branch_id uuid, p_for_date date)
returns void
language plpgsql security definer as $$
declare
  v_revenue numeric;
  v_purchases numeric;
begin
  select coalesce(sum(p.amount), 0) into v_revenue
  from payments p
  join orders o on o.id = p.order_id
  join payment_methods pm on pm.id = p.payment_method_id
  where o.branch_id = p_branch_id
    and o.status = 'paid'
    and pm.key = 'fonepay'
    and (o.closed_at at time zone 'Asia/Kathmandu')::date = p_for_date;

  select coalesce(sum(pp.amount), 0) into v_purchases
  from purchase_payments pp
  join purchases pu on pu.id = pp.purchase_id
  join payment_methods pm on pm.id = pp.payment_method_id
  where pu.branch_id = p_branch_id
    and pu.status <> 'cancelled'
    and pm.key = 'fonepay'
    and (pu.created_at at time zone 'Asia/Kathmandu')::date = p_for_date;

  if v_revenue > 0 then
    insert into bank_ledger_entries (branch_id, entry_date, amount, remark, source)
    values (p_branch_id, p_for_date, v_revenue, 'Fonepay settlement — ' || to_char(p_for_date, 'DD Mon YYYY'), 'fonepay_revenue')
    on conflict (branch_id, entry_date, source) where source is not null do nothing;
  end if;

  if v_purchases > 0 then
    insert into bank_ledger_entries (branch_id, entry_date, amount, remark, source)
    values (p_branch_id, p_for_date, -v_purchases, 'Fonepay purchases — ' || to_char(p_for_date, 'DD Mon YYYY'), 'fonepay_purchases')
    on conflict (branch_id, entry_date, source) where source is not null do nothing;
  end if;
end;
$$;

-- Runs the above for every branch, for "yesterday" in Nepal time — this is
-- what the nightly cron job actually calls, so adding a branch later never
-- needs the schedule itself touched.
create or replace function post_daily_fonepay_entries()
returns void
language plpgsql security definer as $$
declare
  v_branch record;
  v_for_date date := ((now() at time zone 'Asia/Kathmandu')::date - 1);
begin
  for v_branch in select id from branches loop
    perform post_daily_fonepay_entries_for_branch(v_branch.id, v_for_date);
  end loop;
end;
$$;

-- 18:45 UTC = 00:30 Nepal time — just past midnight, so the previous day's
-- last-minute transactions are safely included before it closes that day out.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'post-daily-fonepay-entries') then
    perform cron.unschedule('post-daily-fonepay-entries');
  end if;
end $$;

select cron.schedule('post-daily-fonepay-entries', '45 18 * * *', $$select post_daily_fonepay_entries();$$);
