-- ============================================================================
-- 014_staff_tables.sql
-- A "staff table" — used for staff meals (staff tea, staff lunch, etc).
-- Orders opened here go through the exact same ordering/KOT/kitchen/
-- inventory flow as any other table (inventory already deducts at KOT-send
-- time, see sendItemsToKitchen — nothing new needed there). The only
-- different step is billing: instead of collecting payment, it closes with
-- zero charge, so item cost and inventory movement are still recorded, but
-- no money is expected and nothing is ever marked "due."
-- ============================================================================

alter table restaurant_tables add column if not exists is_staff boolean not null default false;
comment on column restaurant_tables.is_staff is
  'Marks this as a staff/no-charge table. Any restaurant_tables row can be
   flagged this way — there is no separate table type, just this switch,
   so the owner can have exactly as many staff tables as needed.';

-- Stamped once, at order creation, from the table's is_staff flag at that
-- moment — same "stamp facts once" reasoning as orders.due_amount (migration
-- 011). Without this, toggling a table's is_staff flag later, or ever
-- re-deriving "was this a staff order" by joining back to restaurant_tables,
-- risks reclassifying historical orders that were genuinely real sales (or
-- vice versa). Reports should filter on this column directly.
alter table orders add column if not exists is_staff_order boolean not null default false;
comment on column orders.is_staff_order is
  'True if this order was opened on a staff table. Excludes it from revenue
   figures — see reports queries, which should filter is_staff_order = false
   for anything counted as a real sale.';
