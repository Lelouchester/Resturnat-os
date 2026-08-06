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
  phone text,
  slogan text,
  notes text,
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
  google_review_link text,
  table_count integer default 8,
  theme text default 'light', -- 'light' | 'dark'
  brand_color text default '#e8862e', -- overrides the ember accent app-wide, for white-labeling per cafe
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
  is_internal boolean not null default false, -- true for accounts like "Bank" that only move money via internal transfer -- never a customer-facing payment option in Billing/Purchasing, and its balance is hidden from staff without the 'financials' permission
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
  created_by uuid, -- who was signed in when this entry was made — the audit trail's "who" (FK to staff added below, once that table exists)
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Internal transfers between accounts (e.g. Fonepay -> Bank, Bank -> Cash).
-- Always created by transfer_funds() below, never written to directly —
-- that's what actually moves the balances and logs the paired ledger_entries.
-- ----------------------------------------------------------------------------
create table account_transfers (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  from_account_id uuid references accounts(id),
  to_account_id uuid references accounts(id),
  amount numeric(12,2) not null,
  note text,
  created_by uuid, -- FK to staff added below, once that table exists
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
  auth_user_id uuid references auth.users(id), -- set once this person's Google account first signs in
  email text, -- management adds this when creating the staff record; matched against their Google account on first sign-in
  name text not null,
  role staff_role not null default 'waiter',
  pin_hash text, -- bcrypt hash, verified only inside an Edge Function
  is_active boolean default true,
  sales_generated numeric(12,2) default 0, -- denormalized for the Staff screen; recompute from orders periodically
  shifts_worked integer default 0,
  avg_prep_minutes numeric(6,2), -- only meaningful for kitchen role
  created_at timestamptz default now()
);

alter table ledger_entries add constraint ledger_entries_created_by_fkey foreign key (created_by) references staff(id);
alter table account_transfers add constraint account_transfers_created_by_fkey foreign key (created_by) references staff(id);

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
  customer_phone text,
  customer_id uuid, -- FK to customers added below, once that table exists (customers is defined later in this file)
  guest_count integer,
  waiter_id uuid references staff(id),
  seated_at timestamptz,
  position_x integer, -- for the floor-plan grid layout
  position_y integer,
  is_archived boolean not null default false, -- "deleted" tables are archived, not hard-deleted — orders/reservations still reference them for real history
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
  is_active boolean default true,
  exclude_from_discount boolean not null default false -- e.g. alcohol/beer, never discounted
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
  tracked_inventory_item_id uuid, -- when set, selling this item decreases that inventory item's stock 1:1 (FK added below, once inventory_items exists) — for things sold directly like beer, liquor, cigarettes
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
alter table restaurant_tables add constraint restaurant_tables_customer_id_fkey foreign key (customer_id) references customers(id);

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
  is_archived boolean not null default false, -- "deleted" items are archived, not hard-deleted — purchase/stock history still references them for real history
  created_at timestamptz default now()
);

-- Deferred: menu_items.tracked_inventory_item_id needs inventory_items to
-- exist first. "set null" so archiving/removing an inventory item just
-- unlinks it from the menu item rather than blocking the delete.
alter table menu_items add constraint menu_items_tracked_inventory_item_id_fkey
  foreign key (tracked_inventory_item_id) references inventory_items(id) on delete set null;

create table stock_movements (
  id uuid primary key default uuid_generate_v4(),
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  type stock_movement_type not null,
  quantity numeric(10,3) not null, -- signed
  note text,
  created_by uuid, -- FK to staff added below, once that table exists
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
  created_by uuid, -- FK to staff added below, once that table exists
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Notifications are NOT stored — the app computes them live from Inventory
-- (low stock), Customers (overdue dues vs. restaurant_settings.due_reminder_days),
-- Reservations (arriving soon), and Kitchen (order_items stuck 'ready' too
-- long). The only state worth persisting is which ones a person dismissed:
-- ----------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Contacts — general service contacts (electrician, gas/dairy supplier,
-- repair person, etc), separate from paying Customers and from Suppliers
-- (which exist specifically for tracked Purchasing). Simple address-book
-- entry, no purchase history attached.
-- ----------------------------------------------------------------------------
create table contacts (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  name text not null,
  phone text,
  role text, -- free text, e.g. "Electrician", "Dairy supplier"
  notes text,
  created_at timestamptz default now()
);

create table dismissed_notifications (
  staff_id uuid references staff(id) on delete cascade,
  notification_id text not null, -- deterministic id, e.g. 'low-stock-<inventory_item_id>'
  dismissed_at timestamptz default now(),
  primary key (staff_id, notification_id)
);

-- ----------------------------------------------------------------------------
-- Google sign-in linking. Management creates a staff row with someone's name
-- + email before they've ever logged in (auth_user_id is null at that
-- point). The first time that person signs in with the matching Google
-- account, the app calls this function, which claims that staff row for
-- their now-known auth.uid(). It only ever touches a row matching the
-- CALLER's own verified email and only if unclaimed — one person can't use
-- this to hijack another's staff row.
-- ----------------------------------------------------------------------------
create or replace function link_staff_account() returns void
language plpgsql security definer as $$
begin
  update staff
  set auth_user_id = auth.uid()
  where auth_user_id is null
    and email is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and auth.uid() is not null;
end;
$$;

grant execute on function link_staff_account() to authenticated;

-- ----------------------------------------------------------------------------
-- Financial visibility check. True for admin/manager roles, or anyone with
-- an explicit 'financials' permission override — same fallback logic the
-- app's own DEFAULT_PERMISSIONS uses (an override row wins if present,
-- otherwise it falls back to the role default). This is what gates seeing
-- the Bank account, transfer history, and (client-side) older sales history.
-- ----------------------------------------------------------------------------
create or replace function current_staff_financials_ok() returns boolean
language plpgsql stable security definer as $$
declare
  v_staff_id uuid;
  v_role staff_role;
  v_override boolean;
begin
  select id, role into v_staff_id, v_role from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    return false;
  end if;

  select allowed into v_override from permissions where staff_id = v_staff_id and feature_key = 'financials';
  if v_override is not null then
    return v_override;
  end if;

  return v_role in ('admin', 'manager');
end;
$$;

-- ----------------------------------------------------------------------------
-- Moves money between two accounts in the caller's own branch (e.g. Fonepay
-- -> Bank, Bank -> Cash) in one atomic step: both balances update and both
-- ledger_entries rows are written together, or neither happens. SECURITY
-- DEFINER because it needs to touch accounts/ledger_entries directly, but
-- it enforces its own checks below rather than relying on RLS — same
-- narrow-RPC-bypassing-RLS template as link_staff_account() above.
-- ----------------------------------------------------------------------------
create or replace function transfer_funds(p_from_account_id uuid, p_to_account_id uuid, p_amount numeric, p_note text default null)
returns uuid
language plpgsql security definer as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_from_branch uuid;
  v_to_branch uuid;
  v_from_balance numeric;
  v_transfer_id uuid;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;

  if not current_staff_financials_ok() then
    raise exception 'not permitted to move funds between accounts';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'transfer amount must be greater than zero';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'cannot transfer an account to itself';
  end if;

  select branch_id, balance into v_from_branch, v_from_balance from accounts where id = p_from_account_id;
  select branch_id into v_to_branch from accounts where id = p_to_account_id;
  v_branch_id := current_staff_branch();

  if v_from_branch is null or v_to_branch is null then
    raise exception 'account not found';
  end if;
  if v_from_branch <> v_branch_id or v_to_branch <> v_branch_id then
    raise exception 'accounts must belong to your own branch';
  end if;
  if v_from_balance < p_amount then
    raise exception 'insufficient balance in source account';
  end if;

  update accounts set balance = balance - p_amount where id = p_from_account_id;
  update accounts set balance = balance + p_amount where id = p_to_account_id;

  insert into account_transfers (branch_id, from_account_id, to_account_id, amount, note, created_by)
  values (v_branch_id, p_from_account_id, p_to_account_id, p_amount, p_note, v_staff_id)
  returning id into v_transfer_id;

  insert into ledger_entries (account_id, amount, reason, created_by)
  values
    (p_from_account_id, -p_amount, coalesce(p_note, 'internal transfer'), v_staff_id),
    (p_to_account_id, p_amount, coalesce(p_note, 'internal transfer'), v_staff_id);

  return v_transfer_id;
end;
$$;

grant execute on function transfer_funds(uuid, uuid, numeric, text) to authenticated;

-- ============================================================================
-- Row Level Security is intentionally left OFF in this version.
-- Turn it on once real staff login is wired up — see schema.sql for the
-- policies to add at that point. Running with RLS on before login exists
-- would lock the app out of its own tables.
-- ============================================================================
