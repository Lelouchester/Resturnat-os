-- ============================================================================
-- RestaurantOS — Starter seed data
-- Run this once, right after schema.sql, in the Supabase SQL Editor.
-- Populates one branch with payment methods, tables, and a starter menu —
-- everything the app currently shows as "demo data" becomes real rows here.
-- ============================================================================

-- One branch to hang everything off. Change the name/address to your own.
insert into branches (id, name, address)
values ('00000000-0000-0000-0000-000000000001', 'Café Kitli', 'Thamel, Kathmandu');

insert into restaurant_settings (branch_id)
values ('00000000-0000-0000-0000-000000000001');

-- Payment methods — add or remove more later from the Settings screen.
insert into payment_methods (branch_id, key, label, sort_order) values
  ('00000000-0000-0000-0000-000000000001', 'cash', 'Cash', 1),
  ('00000000-0000-0000-0000-000000000001', 'esewa', 'eSewa', 2),
  ('00000000-0000-0000-0000-000000000001', 'fonepay', 'Fonepay', 3);

-- One account (running balance) per payment method, starting at zero.
insert into accounts (branch_id, payment_method_id, balance)
select '00000000-0000-0000-0000-000000000001', id, 0 from payment_methods
where branch_id = '00000000-0000-0000-0000-000000000001';

-- Tables
insert into restaurant_tables (branch_id, label, seats, status) values
  ('00000000-0000-0000-0000-000000000001', 'Table 1', 4, 'available'),
  ('00000000-0000-0000-0000-000000000001', 'Table 2', 2, 'available'),
  ('00000000-0000-0000-0000-000000000001', 'Table 3', 6, 'available'),
  ('00000000-0000-0000-0000-000000000001', 'Table 4', 4, 'available'),
  ('00000000-0000-0000-0000-000000000001', 'Table 5', 2, 'available'),
  ('00000000-0000-0000-0000-000000000001', 'Table 6', 8, 'available'),
  ('00000000-0000-0000-0000-000000000001', 'Table 7', 4, 'available'),
  ('00000000-0000-0000-0000-000000000001', 'Table 8', 4, 'available');

-- Menu categories
insert into menu_categories (id, branch_id, name, sort_order) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Starters', 1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Mains', 2),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Momos', 3),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Drinks', 4),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Desserts', 5);

-- Menu items
insert into menu_items (branch_id, category_id, name, price, is_favorite) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Chicken chilli', 380, true),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Veg spring roll', 260, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Paneer tikka', 340, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Chicken sekuwa', 420, true),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Mutton curry', 560, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Veg thali', 320, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Chicken momo (steamed)', 220, true),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Buff momo (fried)', 200, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Veg jhol momo', 180, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Masala tea', 60, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Lassi', 120, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Coke', 90, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Gulab jamun', 140, false),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Kheer', 160, false);

-- A happy-hour example — draft beer, cheaper 4–6pm.
insert into menu_items (branch_id, category_id, name, price, happy_hour_price, happy_hour_start, happy_hour_end) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Draft beer', 350, 250, '16:00', '18:00');

-- Inventory
insert into inventory_items (branch_id, name, unit, current_stock, min_stock, barcode) values
  ('00000000-0000-0000-0000-000000000001', 'Chicken (raw)', 'kg', 14, 10, null),
  ('00000000-0000-0000-0000-000000000001', 'Basmati rice', 'kg', 38, 20, null),
  ('00000000-0000-0000-0000-000000000001', 'Cooking oil', 'ltr', 6, 8, null),
  ('00000000-0000-0000-0000-000000000001', 'Momo wrappers', 'pcs', 240, 200, null),
  ('00000000-0000-0000-0000-000000000001', 'Coke (bottles)', 'pcs', 18, 24, '8901030826244'),
  ('00000000-0000-0000-0000-000000000001', 'Paneer', 'kg', 3, 5, null);

-- Suppliers
insert into suppliers (branch_id, name, phone, outstanding_balance) values
  ('00000000-0000-0000-0000-000000000001', 'Himalayan Fresh Meat Co.', '98XXXXXXXX', 3200),
  ('00000000-0000-0000-0000-000000000001', 'Kathmandu Grocery Wholesale', '98XXXXXXXX', 0),
  ('00000000-0000-0000-0000-000000000001', 'Valley Beverages Pvt. Ltd.', '98XXXXXXXX', 1450);

-- An admin/manager staff record to log in as first. Give this person a real
-- PIN once the Edge Function that hashes PINs is in place — pin_hash is left
-- null on purpose, since nothing should compare PINs in plain text.
insert into staff (id, branch_id, name, role) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Anjali', 'manager');

insert into permissions (staff_id, feature_key, allowed)
select '20000000-0000-0000-0000-000000000001', feature_key, true
from unnest(array['tables','orders','kitchen','billing','shifts','menu','inventory','purchasing','customers','staff','reports','settings']) as feature_key;
