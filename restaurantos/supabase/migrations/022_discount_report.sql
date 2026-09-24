-- ============================================================================
-- 022_discount_report.sql
--
-- A "how much did we give away in discounts today/this week" figure, added
-- up on the database the same way daily_revenue_vs_purchases already is
-- (migration 017) — one row per day, never the raw order-by-order rows a
-- busy month would otherwise need (and silently truncate past ~1000, per
-- the same lesson that motivated 017).
--
-- Idempotent — safe to paste into the SQL editor, safe to run twice.
-- ============================================================================

create or replace function daily_discounts(p_branch_id uuid, p_from date, p_to date)
returns table (day date, discounted_orders bigint, discount_total numeric, gross_subtotal numeric)
language sql
stable
security invoker
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ),
  daily as (
    select
      (o.closed_at at time zone 'Asia/Kathmandu')::date as day,
      count(*) filter (where o.discount_amount > 0) as discounted_orders,
      sum(o.discount_amount) as discount_total,
      sum(o.subtotal) as gross_subtotal
    from orders o
    where o.branch_id = p_branch_id
      and o.status = 'paid'
      and o.is_staff_order = false
      and o.merged_into_order_id is null
      and o.closed_at >= (p_from::timestamp at time zone 'Asia/Kathmandu')
      and o.closed_at < ((p_to + 1)::timestamp at time zone 'Asia/Kathmandu')
    group by 1
  )
  select
    days.day,
    coalesce(daily.discounted_orders, 0) as discounted_orders,
    coalesce(daily.discount_total, 0) as discount_total,
    coalesce(daily.gross_subtotal, 0) as gross_subtotal
  from days
  left join daily on daily.day = days.day
  order by days.day;
$$;

notify pgrst, 'reload schema';
