-- ============================================================================
-- 017_daily_revenue_vs_purchases.sql
--
-- Replaces the old approach (fetch every individual order/purchase-line
-- row to the browser, add them up in JavaScript) with server-side
-- aggregation — like a spreadsheet pivot table done directly in the
-- database. This returns one row per calendar day, always a small result
-- (30, 90, whatever days were asked for), never the thousands of raw rows
-- a busy month of orders adds up to.
--
-- This is the real fix for the trend chart showing zero for recent dates:
-- the old approach pulled every matching order row to the browser with no
-- way to know it was being silently capped by Supabase's own server-side
-- row limit — a limit that a client-side .limit() call cannot override,
-- no matter how high it's set. A ~2000-order month comfortably exceeds a
-- typical cap; this function sidesteps the problem entirely by never
-- sending row-per-order data over the wire in the first place.
--
-- Idempotent — safe to paste into Supabase's SQL Editor, safe to run twice.
-- ============================================================================

create or replace function daily_revenue_vs_purchases(p_branch_id uuid, p_from date, p_to date)
returns table (day date, revenue numeric, purchases numeric)
language sql
stable
security invoker
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ),
  daily_revenue as (
    select
      (o.closed_at at time zone 'Asia/Kathmandu')::date as day,
      sum(o.total) as revenue
    from orders o
    where o.branch_id = p_branch_id
      and o.status = 'paid'
      and o.is_staff_order = false
      and o.closed_at >= (p_from::timestamp at time zone 'Asia/Kathmandu')
      and o.closed_at < ((p_to + 1)::timestamp at time zone 'Asia/Kathmandu')
    group by 1
  ),
  daily_purchases as (
    select
      (p.created_at at time zone 'Asia/Kathmandu')::date as day,
      sum(pl.quantity * pl.unit_cost) as purchases
    from purchase_lines pl
    join purchases p on p.id = pl.purchase_id
    where p.branch_id = p_branch_id
      and p.status != 'cancelled'
      and p.created_at >= (p_from::timestamp at time zone 'Asia/Kathmandu')
      and p.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kathmandu')
    group by 1
  )
  select
    days.day,
    coalesce(daily_revenue.revenue, 0) as revenue,
    coalesce(daily_purchases.purchases, 0) as purchases
  from days
  left join daily_revenue on daily_revenue.day = days.day
  left join daily_purchases on daily_purchases.day = days.day
  order by days.day;
$$;

grant execute on function daily_revenue_vs_purchases(uuid, date, date) to authenticated;
