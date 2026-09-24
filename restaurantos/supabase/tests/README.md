# Database attack tests

These prove the database's security rules by **actually attacking them** —
each test signs in as a specific person (waiter, manager, shareholder, fired
staff, anonymous visitor...) and tries something, then checks it was allowed
or refused. They also check legitimate actions still work.

They run against a scratch PostgreSQL built from `schema.sql` + migrations,
with small stand-ins for Supabase's `auth` schema and `pg_cron`
(`stubs.sql`). Nothing here touches a real Supabase project.

## Run
    sudo apt-get install -y postgresql          # once
    mkdir -p /tmp/h && cp -r supabase/tests/* /tmp/h && cd /tmp/h && chmod +x *.sh
    export REPO_SQL=/path/to/repo/supabase
    ./baseline.sh      # (optional) the attacks against the state BEFORE 020 — should show the holes
    ./post1.sh         # access, hierarchy, permission overrides       (41 checks)
    ./post2.sh         # cancelling, balance fixes, locked records, stock (38 checks)
    ./post3.sh         # login activity, sign-in linking, safety rules  (31 checks)
    ./safety.sh        # 020 refuses to run on bad data, changes nothing
    ./idem.sh          # 020 can be run repeatedly
    ./guards.sh        # reset/seed refuse to run on a database with orders

Role/permission parity between the app and the database (needs the app's
`types.ts` bundled first):

    cd app && npx esbuild src/features/staff/types.ts --bundle --format=esm --outfile=/tmp/h/types.mjs
    node /tmp/h/parity.mjs

Notes for next time: the Postgres server stops between shell sessions
(`up.sh` restarts it); policy names longer than 63 characters are silently
truncated by Postgres; `ALTER TYPE ... ADD VALUE` can share a script with
later statements only if they compare the role as text (`role::text`).

## Trends tab
    cd app && npx esbuild src/features/reports/trendMath.ts --bundle --format=esm --outfile=/tmp/h/trendMath.mjs
    node /tmp/h/trend_test.mjs      # date/percent maths on month, year and leap-day boundaries (20 checks)
    ./trend_e2e.sh                  # seeds two weeks of known data and checks the REAL daily_revenue_vs_purchases
                                    # returns the exact expected totals for this week and the previous week,
                                    # excluding staff orders, cancelled orders and cancelled purchases

## Atomic payments (021)
    ./post4.sh   # complete_payment / record_order_payment / close_no_charge_order
                  # 37 checks: exact reproductions of the two live-data bugs (a
                  # retried payment now refused; a failure partway through leaves
                  # nothing behind), change given, merged tables, customer due/
                  # loyalty, permissions, and double-booking guards.

## Discount report (022) — a spot-check
    select * from daily_discounts(<branch_id>, '2026-09-20', '2026-09-20');
    -- seed known orders (some with discount_amount, one staff order, one
    -- cancelled) and confirm the totals match by hand; excludes staff and
    -- cancelled orders, matched exactly against seeded data during development.
