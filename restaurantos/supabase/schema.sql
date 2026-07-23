-- ============================================================================
-- RestaurantOS — Core Schema (v2)
-- Target: Supabase (Postgres)
-- Covers every screen currently built: Tables, Reservations, Orders, Kitchen,
-- Billing (split/merge), Shifts, Menu (combos + happy hour), Inventory,
-- Purchasing (categorized, expense or stock lines), Customers (loyalty +
-- dues), Staff (per-feature permissions), Reports, Settings, Notifications
-- (derived — no table needed, see note at the bottom).
-- Ingredient/recipe mapping intentionally omitted — inventory tracks
-- finished stock only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type staff_role as enum ('admin', 'manager', 'cashier', 'waiter', 'kitchen', 'store', 'custom');
create type table_status as enum ('available', 'occupied', 'reserved', 'billing', 'needs_cleaning', 'disabled');
create type order_item_status as enum ('pending', 'preparing', 'ready', 'served', 'void');
create type order_status as enum ('open', 'billing', 'paid', 'cancelled');
create type shift_status as enum ('open', 'closed');
create type purchase_status as enum ('ordered', 'received');
create type purchase_line_kind as enum ('inventory', 'expense');
create type purchase_category as enum ('ingredients', 'beverages', 'cleaning', 'equipment', 'utilities', 'other');
create type stock_movement_type as enum ('purchase', 'sale_deduction', 'adjustment', 'waste', 'physical_count');
create type reservation_status as enum ('upcoming', 'seated', 'no_show', 'cancelled');

-- ----------------------------------------------------------------------------
-- Branches (multi-branch ready from day one — everything hangs off branch_id)
-- ----------------------------------------------------------------------------
create table branches (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  timezone text default 'Asia/Kathmandu',
  currency text default 'NPR',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Restaurant settings — one row per branch. Everything on the Settings screen.
-- ----------------------------------------------------------------------------
create table restaurant_settings (
  branch_id uuid primary key references branches(id) on delete cascade,
  open_time time default '10:00',
  close_time time default '22:00',
  default_tax_pct numeric(5,2) default 13,
  default_service_charge_pct numeric(5,2) default 10,
  receipt_footer text default 'Thank you — please visit again',
  table_count integer default 8,
  theme text default 'light', -- 'light' | 'dark'
  due_reminder_days integer default 7
);

-- ----------------------------------------------------------------------------
-- Payment methods — configurable per branch (Settings > Payment methods).
-- Billing, Shifts, and Purchasing all read this same list, so adding one
-- method in Settings makes it available everywhere money moves.
-- ----------------------------------------------------------------------------
create table payment_methods (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  key text not null, -- 'cash', 'esewa', 'fonepay', or a custom slug
  label text not null,
  sort_order integer default 0,
  unique (branch_id, key)
);

-- ----------------------------------------------------------------------------
-- Accounts / ledger — one running balance per payment method. Billing
-- deposits into these, Purchasing withdraws from them.
-- ----------------------------------------------------------------------------
create table accounts (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  payment_method_id uuid references payment_methods(id) on delete cascade,
  balance numeric(12,2) default 0,
  unique (branch_id, payment_method_id)
);

create table ledger_entries (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid references accounts(id) on delete cascade,
  amount numeric(12,2) not null, -- positive = deposit, negative = withdrawal
  reason text, -- e.g. 'order payment', 'purchase payment', 'supplier payment'
  order_id uuid, -- nullable FK, set below once orders exists
  purchase_id uuid, -- nullable FK, set below once purchases exists
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Staff & auth
-- Supabase Auth (email/password) is used for the owner/admin account that
-- provisions staff. Floor staff use a 4-digit PIN checked server-side via
-- an Edge Function (never compare PINs in client JS — see /supabase/functions).
-- ----------------------------------------------------------------------------
create table staff (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  auth_user_id uuid references auth.users(id), -- null for PIN-only staff
  name text not null,
  role staff_role not null default 'waiter',
  pin_hash text, -- bcrypt hash, verified only inside an Edge Function
  is_active boolean default true,
  sales_generated numeric(12,2) default 0, -- denormalized for the Staff screen; recompute from orders periodically
  shifts_worked integer default 0,
  avg_prep_minutes numeric(6,2), -- only meaningful for kitchen role
  created_at timestamptz default now()
);

-- Per-person, per-feature access — matches the toggle list on the Staff
-- screen exactly (tables, orders, kitchen, billing, shifts, menu, inventory,
-- purchasing, customers, staff, reports, settings). Seeded from role
-- defaults when a staff member is created, then freely overridden per person.
create table permissions (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid references staff(id) on delete cascade,
  feature_key text not null,
  allowed boolean default true,
  unique (staff_id, feature_key)
);

-- ----------------------------------------------------------------------------
-- Tables / seats
-- ----------------------------------------------------------------------------
create table restaurant_tables (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  label text not null, -- "Table 1", "Patio 3"
  seats integer default 4,
  status table_status not null default 'available',
  customer_name text,
  guest_count integer,
  waiter_id uuid references staff(id),
  seated_at timestamptz,
  position_x integer, -- for the floor-plan grid layout
  position_y integer,
  created_at timestamptz default now()
);

create table reservations (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  table_id uuid references restaurant_tables(id),
  guest_name text not null,
  phone text,
  party_size integer,
  arrival_time timestamptz not null,
  special_requests text,
  status reservation_status not null default 'upcoming',
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Menu — including combos and happy-hour pricing
-- ----------------------------------------------------------------------------
create table menu_categories (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  name text not null,
  sort_order integer default 0,
  is_active boolean default true
);

create table menu_items (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  category_id uuid references menu_categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null,
  tax_rate numeric(5,2) default 0,
  image_url text,
  prep_time_minutes integer,
  is_available boolean default true,
  is_favorite boolean default false,
  sort_order integer default 0,
  -- Happy hour — null start/end/price means no happy hour pricing for this item.
  happy_hour_price numeric(10,2),
  happy_hour_start time,
  happy_hour_end time,
  created_at timestamptz default now()
);

create table menu_modifiers (
  id uuid primary key default uuid_generate_v4(),
  menu_item_id uuid references menu_items(id) on delete cascade,
  name text not null, -- "Extra cheese", "No onion"
  price_delta numeric(10,2) default 0
);

-- Combo meals: a menu_item flagged as a combo bundles other menu_items,
-- charged at the parent item's own `price` — this table just records what's
-- included, for the kitchen ticket and the menu screen's "Combo: ..." badge.
create table menu_item_combo_components (
  combo_item_id uuid references menu_items(id) on delete cascade,
  component_item_id uuid references menu_items(id) on delete cascade,
  primary key (combo_item_id, component_item_id)
);

-- ----------------------------------------------------------------------------
-- Shifts (start/end of day — orders cannot be created without an open shift)
-- opening/closing balances are per payment method now, not cash-only.
-- ----------------------------------------------------------------------------
create table shifts (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  opened_by uuid references staff(id),
  closed_by uuid references staff(id),
  status shift_status not null default 'open',
  opened_at timestamptz default now(),
  closed_at timestamptz
);

create table shift_balances (
  id uuid primary key default uuid_generate_v4(),
  shift_id uuid references shifts(id) on delete cascade,
  payment_method_id uuid references payment_methods(id),
  opening_amount numeric(10,2) default 0,
  closing_amount numeric(10,2), -- null until the shift is closed
  expected_amount numeric(10,2), -- opening + sales for that method, computed at close
  unique (shift_id, payment_method_id)
);

-- ----------------------------------------------------------------------------
-- Customers — dues now carry a `due_since` so the Settings reminder
-- threshold means something.
-- ----------------------------------------------------------------------------
create table customers (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  name text, -- optional — a visit can be logged as "Walk-in" and named later
  phone text, -- optional, same reasoning
  lifetime_spend numeric(12,2) default 0,
  loyalty_points integer default 0,
  outstanding_due numeric(12,2) default 0,
  due_since timestamptz, -- set when a due first appears, cleared when settled to 0
  notes text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Orders — a table can hold more than one order over its lifetime, but only
-- one open order at a time. Merge Bills is modeled by billing two orders'
-- line items together at payment time rather than rewriting ownership here.
-- ----------------------------------------------------------------------------
create table orders (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  table_id uuid references restaurant_tables(id),
  shift_id uuid references shifts(id),
  waiter_id uuid references staff(id),
  customer_id uuid references customers(id),
  status order_status not null default 'open',
  merged_into_order_id uuid references orders(id), -- set when this order's bill was merged into another table's
  subtotal numeric(10,2) default 0,
  discount_amount numeric(10,2) default 0,
  service_charge numeric(10,2) default 0,
  tax_amount numeric(10,2) default 0,
  tip_amount numeric(10,2) default 0,
  total numeric(10,2) default 0,
  split_guest_count integer default 1, -- >1 means the bill was split evenly this many ways
  opened_at timestamptz default now(),
  closed_at timestamptz
);

create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  custom_name text, -- for one-off custom items not on the menu
  quantity integer not null default 1,
  unit_price numeric(10,2) not null, -- captured at order time (respects happy hour at the moment it was added)
  note text,
  status order_item_status not null default 'pending',
  is_complimentary boolean default false,
  void_reason text, -- set when status = 'void'
  created_at timestamptz default now(),
  status_updated_at timestamptz default now()
);

create table payments (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade,
  payment_method_id uuid references payment_methods(id),
  amount numeric(10,2) not null,
  is_due boolean default false,
  due_settled_at timestamptz,
  created_at timestamptz default now()
);

alter table ledger_entries add constraint ledger_entries_order_id_fkey foreign key (order_id) references orders(id);

-- ----------------------------------------------------------------------------
-- Inventory (finished stock only — no recipe/ingredient mapping)
-- ----------------------------------------------------------------------------
create table inventory_items (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  name text not null,
  unit text default 'pcs',
  current_stock numeric(10,3) default 0,
  min_stock numeric(10,3) default 5,
  barcode text,
  created_at timestamptz default now()
);

create table stock_movements (
  id uuid primary key default uuid_generate_v4(),
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  type stock_movement_type not null,
  quantity numeric(10,3) not null, -- signed
  note text,
  created_by uuid references staff(id),
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Purchasing — every purchase the place makes, ingredients to a broom.
-- A line is either a tracked inventory item (bumps stock on receipt) or a
-- one-off expense (just a description and an amount, nothing to track).
-- ----------------------------------------------------------------------------
create table suppliers (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  name text not null,
  phone text,
  outstanding_balance numeric(12,2) default 0,
  notes text
);

create table purchases (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  supplier_id uuid references suppliers(id), -- null = one-off purchase, no ongoing credit relationship
  category purchase_category not null default 'other',
  status purchase_status not null default 'ordered',
  created_at timestamptz default now(),
  received_at timestamptz
);

create table purchase_lines (
  id uuid primary key default uuid_generate_v4(),
  purchase_id uuid references purchases(id) on delete cascade,
  kind purchase_line_kind not null default 'inventory',
  inventory_item_id uuid references inventory_items(id), -- set when kind = 'inventory'
  description text not null, -- item name, or the expense description ("Broom", "Gas refill")
  quantity numeric(10,3) not null default 1,
  unit_cost numeric(10,2) not null default 0
);

-- Split payment at time of purchase — mirrors `payments` on the orders side.
-- Any shortfall vs. the purchase total adds to the supplier's outstanding_balance.
create table purchase_payments (
  id uuid primary key default uuid_generate_v4(),
  purchase_id uuid references purchases(id) on delete cascade,
  payment_method_id uuid references payment_methods(id),
  amount numeric(10,2) not null,
  created_at timestamptz default now()
);

alter table ledger_entries add constraint ledger_entries_purchase_id_fkey foreign key (purchase_id) references purchases(id);

-- ----------------------------------------------------------------------------
-- Expenses (recurring/general expenses not tied to a specific purchase —
-- rent, salaries, etc. Distinct from `purchases`, which is always a
-- transaction with line items.)
-- ----------------------------------------------------------------------------
create table expenses (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  category text not null,
  amount numeric(10,2) not null,
  note text,
  is_recurring boolean default false,
  attachment_url text,
  created_by uuid references staff(id),
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Notifications are NOT stored — the app computes them live from Inventory
-- (low stock), Customers (overdue dues vs. restaurant_settings.due_reminder_days),
-- Reservations (arriving soon), and Kitchen (order_items stuck 'ready' too
-- long). The only state worth persisting is which ones a person dismissed:
-- ----------------------------------------------------------------------------
create table dismissed_notifications (
  staff_id uuid references staff(id) on delete cascade,
  notification_id text not null, -- deterministic id, e.g. 'low-stock-<inventory_item_id>'
  dismissed_at timestamptz default now(),
  primary key (staff_id, notification_id)
);

-- ============================================================================
-- Row Level Security — enable + starter policies
-- Real policies should key off staff.role and permissions, scoped by
-- branch_id. Below is the pattern to extend per table.
-- ============================================================================
alter table restaurant_tables enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table staff enable row level security;

-- Example: any authenticated staff member can read/write tables in their own branch.
-- Requires a helper that maps auth.uid() -> staff row -> branch_id.
create or replace function current_staff_branch() returns uuid as $$
  select branch_id from staff where auth_user_id = auth.uid() limit 1;
$$ language sql stable;

create policy "staff can access their branch tables"
  on restaurant_tables for all
  using (branch_id = current_staff_branch())
  with check (branch_id = current_staff_branch());

create policy "staff can access their branch orders"
  on orders for all
  using (branch_id = current_staff_branch())
  with check (branch_id = current_staff_branch());

-- NOTE: PIN-based floor staff (no Supabase auth_user_id) authenticate through
-- an Edge Function that verifies the PIN hash and issues a short-lived
-- signed session (or a scoped Supabase JWT via a custom auth hook). Do not
-- relax RLS to make client-side PIN comparisons work — that recreates the
-- exact vulnerability being fixed.
--
-- Extend the same "staff can access their branch X" policy to every other
-- table above before going live — RLS is opt-in per table, and only the four
-- above are enabled so far.
