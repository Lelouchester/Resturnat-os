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
create type purchase_status as enum ('ordered', 'received', 'cancelled');
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
  code text unique, -- short login code staff type before Google sign-in, e.g. "myhapa" — this is what disambiguates which cafe to link/resolve against when the same email might exist in more than one
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
  label text not null, -- "Table 1", "Patio 3" — the fixed system identifier, used everywhere internally
  nickname text, -- optional, persistent — "Near window", shown alongside the label, purely for staff's own reference
  seats integer default 4,
  status table_status not null default 'available',
  customer_name text,
  customer_phone text,
  customer_id uuid, -- FK to customers added below, once that table exists (customers is defined later in this file)
  guest_count integer,
  waiter_id uuid references staff(id),
  seated_at timestamptz,
  note text, -- optional, transient — e.g. "came from Table 3" — cleared automatically whenever the table's current party leaves, same lifecycle as customer_name/guest_count/seated_at
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
  kot_printed_at timestamptz, -- set the moment this item is first sent to the kitchen on a KOT print
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
create or replace function link_staff_account(p_code text default null) returns void
language plpgsql security definer as $$
begin
  -- p_code disambiguates which cafe to claim a row in, for the case where
  -- the same email exists as staff in more than one branch (one owner
  -- running two cafes, say). Without a code, this falls back to the old
  -- behaviour of matching on email alone across every branch — kept for
  -- backward compatibility, but the login screen always passes a code now.
  update staff
  set auth_user_id = auth.uid()
  where auth_user_id is null
    and email is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and auth.uid() is not null
    and (p_code is null or branch_id = (select id from branches where lower(code) = lower(p_code)));
end;
$$;

grant execute on function link_staff_account(text) to authenticated;

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

-- ----------------------------------------------------------------------------
-- Atomically adjusts one account's balance by delta (positive or negative)
-- and logs the matching ledger_entries row in the same statement/transaction.
-- Used by deposit/withdraw/adjustBalance instead of a read-then-write from
-- the client, which has a real race window under concurrent staff (two
-- people completing Cash payments in the same instant could otherwise
-- silently clobber one another). security invoker — respects the caller's
-- normal RLS, no privilege bypass needed since staff already have write
-- access to their own branch's accounts/ledger_entries.
-- ----------------------------------------------------------------------------
create or replace function increment_balance(p_account_id uuid, p_delta numeric, p_reason text, p_order_id uuid default null, p_purchase_id uuid default null)
returns numeric
language plpgsql security invoker as $$
declare
  v_staff_id uuid;
  v_new_balance numeric;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and is_active limit 1;

  update accounts set balance = balance + p_delta where id = p_account_id
  returning balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'account not found';
  end if;

  insert into ledger_entries (account_id, amount, reason, order_id, purchase_id, created_by)
  values (p_account_id, p_delta, p_reason, p_order_id, p_purchase_id, v_staff_id);

  return v_new_balance;
end;
$$;

grant execute on function increment_balance(uuid, numeric, text, uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Same fix as increment_balance, for inventory stock — atomically adjusts
-- current_stock by delta (never below 0) and logs the matching
-- stock_movements row in one statement, instead of a client-side
-- read-then-write with a real race window under concurrent staff.
-- ----------------------------------------------------------------------------
create or replace function increment_stock(p_item_id uuid, p_delta numeric, p_type text, p_note text default null)
returns numeric
language plpgsql security invoker as $$
declare
  v_new_stock numeric;
begin
  update inventory_items set current_stock = greatest(0, current_stock + p_delta) where id = p_item_id
  returning current_stock into v_new_stock;

  if v_new_stock is null then
    raise exception 'inventory item not found';
  end if;

  insert into stock_movements (inventory_item_id, type, quantity, note)
  values (p_item_id, p_type::stock_movement_type, p_delta, p_note);

  return v_new_stock;
end;
$$;

grant execute on function increment_stock(uuid, numeric, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Reverses a purchase in one atomic step — see schema.sql for full comments.
-- ----------------------------------------------------------------------------
create or replace function cancel_purchase(p_purchase_id uuid, p_local_day_start timestamptz)
returns void
language plpgsql security definer as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_purchase purchases%rowtype;
  v_line record;
  v_payment record;
  v_lines_total numeric;
  v_paid_total numeric;
  v_shortfall numeric;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;

  v_branch_id := current_staff_branch();

  select * into v_purchase from purchases where id = p_purchase_id and branch_id = v_branch_id;
  if v_purchase.id is null then
    raise exception 'purchase not found';
  end if;

  if v_purchase.status = 'cancelled' then
    raise exception 'purchase is already cancelled';
  end if;

  if v_purchase.created_at < p_local_day_start then
    raise exception 'only a purchase from today can be cancelled';
  end if;

  if v_purchase.status = 'received' then
    for v_line in
      select inventory_item_id, quantity, description from purchase_lines
      where purchase_id = p_purchase_id and kind = 'inventory' and inventory_item_id is not null
    loop
      update inventory_items set current_stock = greatest(0, current_stock - v_line.quantity) where id = v_line.inventory_item_id;
      insert into stock_movements (inventory_item_id, type, quantity, note, created_by)
      values (v_line.inventory_item_id, 'adjustment', -v_line.quantity, 'Purchase cancelled: ' || v_line.description, v_staff_id);
    end loop;
  end if;

  for v_payment in
    select pp.amount, a.id as account_id
    from purchase_payments pp
    join accounts a on a.payment_method_id = pp.payment_method_id and a.branch_id = v_branch_id
    where pp.purchase_id = p_purchase_id
  loop
    update accounts set balance = balance + v_payment.amount where id = v_payment.account_id;
    insert into ledger_entries (account_id, amount, reason, purchase_id, created_by)
    values (v_payment.account_id, v_payment.amount, 'purchase cancelled', p_purchase_id, v_staff_id);
  end loop;

  select coalesce(sum(quantity * unit_cost), 0) into v_lines_total from purchase_lines where purchase_id = p_purchase_id;
  select coalesce(sum(amount), 0) into v_paid_total from purchase_payments where purchase_id = p_purchase_id;
  v_shortfall := greatest(0, v_lines_total - v_paid_total);

  if v_shortfall > 0 and v_purchase.supplier_id is not null then
    update suppliers set outstanding_balance = greatest(0, outstanding_balance - v_shortfall) where id = v_purchase.supplier_id;
  end if;

  update purchases set status = 'cancelled' where id = p_purchase_id;
end;
$$;

grant execute on function cancel_purchase(uuid, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- Cancel a completed (paid) order from today — see migration 005 for full comments.
-- ----------------------------------------------------------------------------
create or replace function cancel_order(p_order_id uuid, p_local_day_start timestamptz)
returns void
language plpgsql security definer as $$
declare
  v_staff_id uuid;
  v_branch_id uuid;
  v_order orders%rowtype;
  v_item record;
  v_payment record;
  v_paid_total numeric;
  v_change_given numeric;
  v_due_contribution numeric;
  v_others_merged_in boolean;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid() and is_active limit 1;
  if v_staff_id is null then
    raise exception 'no active staff record for caller';
  end if;

  v_branch_id := current_staff_branch();

  select * into v_order from orders where id = p_order_id and branch_id = v_branch_id;
  if v_order.id is null then
    raise exception 'order not found';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'only a completed (paid) order can be cancelled this way — for an order still open or being billed, use Cancel from the table instead';
  end if;

  if v_order.closed_at is null or v_order.closed_at < p_local_day_start then
    raise exception 'only an order closed today can be cancelled';
  end if;

  if v_order.merged_into_order_id is not null then
    raise exception 'this order was merged into another bill — cancel that one instead';
  end if;

  select exists(select 1 from orders where merged_into_order_id = p_order_id) into v_others_merged_in;
  if v_others_merged_in then
    raise exception 'other orders were merged into this bill — this can''t be cleanly undone automatically, please correct it manually';
  end if;

  -- Undo tracked inventory (1:1 items like beer/liquor sold directly).
  for v_item in
    select oi.quantity, mi.tracked_inventory_item_id, coalesce(oi.custom_name, mi.name) as item_name
    from order_items oi
    left join menu_items mi on mi.id = oi.menu_item_id
    where oi.order_id = p_order_id and oi.status <> 'void' and mi.tracked_inventory_item_id is not null
  loop
    update inventory_items set current_stock = current_stock + v_item.quantity where id = v_item.tracked_inventory_item_id;
    insert into stock_movements (inventory_item_id, type, quantity, note, created_by)
    values (v_item.tracked_inventory_item_id, 'adjustment', v_item.quantity, 'Order cancelled: ' || v_item.item_name, v_staff_id);
  end loop;

  -- Undo the money: each payment collected for this order gets withdrawn
  -- back out of the account it was deposited into.
  select coalesce(sum(amount), 0) into v_paid_total from payments where order_id = p_order_id;

  for v_payment in
    select p.amount, a.id as account_id
    from payments p
    join accounts a on a.payment_method_id = p.payment_method_id and a.branch_id = v_branch_id
    where p.order_id = p_order_id
  loop
    update accounts set balance = balance - v_payment.amount where id = v_payment.account_id;
    insert into ledger_entries (account_id, amount, reason, order_id, created_by)
    values (v_payment.account_id, -v_payment.amount, 'order cancelled', p_order_id, v_staff_id);
  end loop;

  -- If change was given out at completion (paid more than the bill), that
  -- cash needs to come back since the whole transaction is being undone.
  v_change_given := greatest(0, v_paid_total - v_order.total);
  if v_change_given > 0 then
    declare v_cash_account_id uuid;
    begin
      select a.id into v_cash_account_id
      from accounts a join payment_methods pm on pm.id = a.payment_method_id
      where pm.key = 'cash' and a.branch_id = v_branch_id;
      if v_cash_account_id is not null then
        update accounts set balance = balance + v_change_given where id = v_cash_account_id;
        insert into ledger_entries (account_id, amount, reason, order_id, created_by)
        values (v_cash_account_id, v_change_given, 'order cancelled: change reversed', p_order_id, v_staff_id);
      end if;
    end;
  end if;

  -- Undo the customer's due/lifetime-spend/loyalty effect from this order,
  -- floored at zero so it can't push their numbers negative if they've
  -- settled part of their due since this order happened.
  if v_order.customer_id is not null then
    v_due_contribution := greatest(0, v_order.total - v_paid_total);
    update customers
    set
      lifetime_spend = greatest(0, lifetime_spend - v_order.total),
      loyalty_points = greatest(0, loyalty_points - round(v_order.total / 100)),
      outstanding_due = greatest(0, outstanding_due - v_due_contribution),
      due_since = case when greatest(0, outstanding_due - v_due_contribution) = 0 then null else due_since end
    where id = v_order.customer_id;
  end if;

  update order_items set status = 'void', void_reason = 'Order cancelled', status_updated_at = now()
  where order_id = p_order_id and status <> 'void';

  update orders set status = 'cancelled' where id = p_order_id;
end;
$$;

grant execute on function cancel_order(uuid, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- Manual bank reconciliation ledger — see migration 006 for full comments.
-- Deliberately append-only: no update/delete policy exists for this table.
-- ----------------------------------------------------------------------------

create table bank_ledger_entries (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  entry_date date not null,
  amount numeric(12,2) not null,
  remark text not null,
  created_by uuid references staff(id),
  created_at timestamptz default now()
);



create table menu_inventory_links (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid references branches(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete cascade,
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  created_at timestamptz default now(),
  unique (menu_item_id, inventory_item_id)
);

-- ============================================================================
-- Row Level Security is intentionally left OFF in this version.
-- Turn it on once real staff login is wired up — see schema.sql for the
-- policies to add at that point. Running with RLS on before login exists
-- would lock the app out of its own tables.
-- ============================================================================
