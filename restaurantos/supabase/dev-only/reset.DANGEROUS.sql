-- ############################################################################
-- #  DANGER — THIS SCRIPT DELETES EVERY TABLE, EVERY ORDER, EVERY PAYMENT.   #
-- #  It is for a brand-new empty test project ONLY. Never run it on a cafe   #
-- #  that has real data. It also does not know about tables added after      #
-- #  migration 003, so it would leave a half-wiped database. If you ever     #
-- #  need a clean start, create a NEW Supabase project instead.              #
-- #                                                                          #
-- #  To run it anyway you must put this line at the very top of the same     #
-- #  SQL Editor run, before everything else:                                 #
-- #      set app.i_understand_this_deletes_everything = 'yes';               #
-- ############################################################################
do $$
declare
  v_orders bigint;
begin
  if coalesce(current_setting('app.i_understand_this_deletes_everything', true), '') <> 'yes' then
    raise exception 'STOPPED: reset.DANGEROUS.sql deletes EVERYTHING and was not confirmed. Nothing was changed.';
  end if;
  if to_regclass('public.orders') is not null then
    execute 'select count(*) from public.orders' into v_orders;
    if v_orders > 0 then
      raise exception 'STOPPED: this database has real orders in it. Nothing was changed.';
    end if;
  end if;
end $$;

-- ============================================================================
-- RestaurantOS — Reset script
-- Run this FIRST if you ever get an error like "type already exists" or
-- "relation already exists" — it means a previous attempt got partway
-- through. This wipes every table/type/function this project creates, so
-- you can re-run schema_no_rls.sql (then seed.sql) on a clean slate.
--
-- Safe to run any time before you have real customer data in here — it
-- deletes everything this schema owns, nothing else in your project.
-- ============================================================================

drop table if exists dismissed_notifications cascade;
drop table if exists expenses cascade;
drop table if exists purchase_payments cascade;
drop table if exists purchase_lines cascade;
drop table if exists purchases cascade;
drop table if exists suppliers cascade;
drop table if exists stock_movements cascade;
drop table if exists inventory_items cascade;
drop table if exists payments cascade;
drop table if exists order_items cascade;
drop table if exists orders cascade;
drop table if exists customers cascade;
drop table if exists shift_balances cascade;
drop table if exists shifts cascade;
drop table if exists menu_item_combo_components cascade;
drop table if exists menu_modifiers cascade;
drop table if exists menu_items cascade;
drop table if exists menu_categories cascade;
drop table if exists reservations cascade;
drop table if exists restaurant_tables cascade;
drop table if exists permissions cascade;
drop table if exists staff cascade;
drop table if exists ledger_entries cascade;
drop table if exists accounts cascade;
drop table if exists payment_methods cascade;
drop table if exists restaurant_settings cascade;
drop table if exists branches cascade;

drop function if exists current_staff_branch();

drop type if exists reservation_status;
drop type if exists stock_movement_type;
drop type if exists purchase_category;
drop type if exists purchase_line_kind;
drop type if exists purchase_status;
drop type if exists shift_status;
drop type if exists order_status;
drop type if exists order_item_status;
drop type if exists table_status;
drop type if exists staff_role;
