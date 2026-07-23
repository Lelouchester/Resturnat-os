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
