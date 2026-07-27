# RestaurantOS

A ground-up rebuild of the restaurant management concept from the original
prototype — full feature scope, new architecture, new design, and now a real
database behind at least one screen.

## What's in here

```
restaurantos/
  supabase/
    schema.sql          Full plan — 27 tables, validated against a real
                         Postgres instance. Includes the RLS section at
                         the bottom (leave that for later — see below).
    schema_no_rls.sql    Same thing, with the RLS section already removed —
                         this is the one to actually run right now.
    seed.sql             Starter data: one branch, payment methods, tables,
                         menu, inventory, suppliers, one staff record.
  app/                   Vite + React + TypeScript + Tailwind v4 frontend, PWA-ready.
```

## Status

Every screen from the original feature list has a working UI: Tables,
Reservations, Orders, Kitchen, Billing (split/merge), Shifts, Menu (combos +
happy hour), Inventory, Purchasing, Customers (loyalty + dues), Staff
(per-feature permissions), Reports, Settings, Notifications, dark mode,
keyboard shortcuts.

**Tables is the first screen wired to a real Supabase database** —
`features/tables/tablesStore.ts` fetches from and writes to Postgres, with a
Realtime subscription so two devices see the same floor at the same time.
Everything else still runs on in-memory demo data that resets on refresh.
The plan is to convert the rest screen-by-screen in the same pattern,
starting with whatever's next in the operational flow (Orders → Kitchen →
Billing → Shifts).

## Running it

```bash
cd app
npm install
cp .env.local.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Setting up Supabase

1. Create a project at supabase.com.
2. In the SQL Editor, run **`schema_no_rls.sql`** (not `schema.sql` — that one
   still has the security-locking section at the bottom, which needs real
   staff login to exist first, or it locks the app out of its own tables).
3. Run **`seed.sql`** right after — this gives you a starter branch, tables,
   menu, and inventory instead of an empty database.
4. Copy your Project URL and `anon` public key from Project Settings → API
   into `app/.env.local`.

**Turning security on later:** once real staff PIN login exists (see next
point), run just the RLS section from the bottom of `schema.sql` — it's split
out specifically so it can be added on its own, without re-running everything
else.

**Do not verify staff PINs in client JS.** The PIN screen right now is a UI
mockup only — no real check happens yet. Before this goes anywhere near real
money, that needs a Supabase Edge Function that checks a bcrypt hash
server-side, plus the RLS policies above turned on. This was the exact
security gap in the original prototype (PINs compared in a plain client-side
object, trivially bypassed via dev tools) — worth fixing once, properly.

## A note on the anon key

The `anon` key is meant to be exposed in client-side code — that's normal.
But with Row Level Security still off (see above), that key currently has
full read/write access to every table. Treat `.env.local` like a password for
now: don't post it publicly, don't share the project URL + key together
outside this project. Turning RLS on closes this gap for good.

## Design direction

The signature idea is the kitchen order ticket: monospace numerals for
anything counted or timed (table number, prices, elapsed minutes), a warm
amber "ready lamp" accent, and a torn-ticket edge as the one recurring motif.
Status colors (green/amber/blue/red) stay conventional on purpose — a waiter
needs to read a table's state in half a second, that's not where to take a
design risk.

Tokens live in `app/src/index.css` under `@theme` (Tailwind v4's CSS-first
config) — change the palette there, it propagates everywhere, light and dark
mode included.

## Why Supabase over Firebase

Postgres gives real relational integrity (an order line references a table, a
menu item, a shift — foreign keys stop the kind of data corruption a document
store invites at this scale), Row Level Security enforces roles at the
database instead of in JS, and it's open-source — if self-hosting is ever
needed, the same schema moves with it. If offline resilience on flaky
restaurant wifi becomes a priority later, look at PowerSync or ElectricSQL —
both sync a local SQLite cache against a Postgres/Supabase backend.

## Next steps

1. Convert Orders, Kitchen, Billing, and Shifts to real Supabase data, the
   same way Tables was — that's the core loop a shift actually runs on.
2. Deploy to Vercel (or similar) so this can actually be tested outside a
   development machine — right now the only way to see live data working is
   to run `npm run dev` locally.
3. Real staff login + PIN verification via an Edge Function, then turn on RLS.
4. Convert the remaining screens (Menu, Inventory, Purchasing, Customers,
   Staff, Reports, Settings) the same way.
