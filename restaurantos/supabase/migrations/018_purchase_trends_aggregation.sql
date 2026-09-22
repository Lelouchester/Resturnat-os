-- ============================================================================
-- 018_purchase_trends_aggregation.sql
--
-- Same fix as migration 017, applied to Purchasing's own Trends tab: do
-- the day-by-day and item/supplier totals inside the database instead of
-- pulling every individual purchase_line row to the browser and adding
-- them up in JavaScript. That older approach is what caused the revenue
-- trend to show zero for a stretch of recent dates — it's structurally
-- exposed to the same failure the moment this branch's purchase volume
-- grows enough, so it's worth fixing before it becomes a live problem
-- rather than after.
--
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

create or replace function purchase_daily_spend(p_branch_id uuid, p_from date, p_to date)
returns table (day date, spend numeric)
language sql
stable
security invoker
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ),
  daily as (
    select
      (p.created_at at time zone 'Asia/Kathmandu')::date as day,
      sum(pl.quantity * pl.unit_cost) as spend
    from purchase_lines pl
    join purchases p on p.id = pl.purchase_id
    where p.branch_id = p_branch_id
      and p.status != 'cancelled'
      and p.created_at >= (p_from::timestamp at time zone 'Asia/Kathmandu')
      and p.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kathmandu')
    group by 1
  )
  select days.day, coalesce(daily.spend, 0) as spend
  from days
  left join daily on daily.day = days.day
  order by days.day;
$$;

create or replace function purchase_totals_by_item(p_branch_id uuid, p_from date, p_to date)
returns table (name text, unit text, qty numeric, spend numeric)
language sql
stable
security invoker
as $$
  select
    coalesce(i.name, pl.description) as name,
    i.unit,
    sum(pl.quantity) as qty,
    sum(pl.quantity * pl.unit_cost) as spend
  from purchase_lines pl
  join purchases p on p.id = pl.purchase_id
  left join inventory_items i on i.id = pl.inventory_item_id
  where p.branch_id = p_branch_id
    and p.status != 'cancelled'
    and p.created_at >= (p_from::timestamp at time zone 'Asia/Kathmandu')
    and p.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kathmandu')
  group by coalesce(i.name, pl.description), i.unit
  order by spend desc
  limit 10;
$$;

create or replace function purchase_totals_by_supplier(p_branch_id uuid, p_from date, p_to date)
returns table (name text, spend numeric)
language sql
stable
security invoker
as $$
  select
    coalesce(s.name, 'One-off') as name,
    sum(pl.quantity * pl.unit_cost) as spend
  from purchase_lines pl
  join purchases p on p.id = pl.purchase_id
  left join suppliers s on s.id = p.supplier_id
  where p.branch_id = p_branch_id
    and p.status != 'cancelled'
    and p.created_at >= (p_from::timestamp at time zone 'Asia/Kathmandu')
    and p.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kathmandu')
  group by coalesce(s.name, 'One-off')
  order by spend desc;
$$;

grant execute on function purchase_daily_spend(uuid, date, date) to authenticated;
grant execute on function purchase_totals_by_item(uuid, date, date) to authenticated;
grant execute on function purchase_totals_by_supplier(uuid, date, date) to authenticated;
