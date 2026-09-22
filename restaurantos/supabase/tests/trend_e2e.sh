#!/bin/bash
/tmp/h/up.sh; /tmp/h/rebuild.sh >/dev/null 2>&1
BR=aaaaaaaa-0000-0000-0000-00000000000a; TB=e1000000-0000-0000-0000-00000000000a
# Deterministic data, 1–21 Sep 2026 (Nepal days). Order closed at 10:00 Nepal (04:15 UTC), purchase at 09:00 Nepal.
#   sales/day = 1000 + 10*d          purchases/day = 500 + d
# Decoys that must NOT be counted: a staff order (999), a cancelled order (777), a cancelled purchase (5555).
python3 - <<'PY' > /tmp/h/trend_seed.sql
print("set session_replication_role = replica; delete from payments; delete from orders;")
for d in range(1, 22):
    print(f"insert into orders(branch_id,table_id,status,total,closed_at,is_staff_order) values ('aaaaaaaa-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','paid',{1000+10*d},'2026-09-{d:02d} 10:00:00+05:45',false);")
    print(f"insert into orders(branch_id,table_id,status,total,closed_at,is_staff_order) values ('aaaaaaaa-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','paid',999,'2026-09-{d:02d} 11:00:00+05:45',true);")
    print(f"insert into orders(branch_id,table_id,status,total,closed_at) values ('aaaaaaaa-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','cancelled',777,'2026-09-{d:02d} 12:00:00+05:45');")
    print(f"insert into purchases(id,branch_id,status,created_at) values ('9c0000{d:02d}-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','received','2026-09-{d:02d} 09:00:00+05:45');")
    print(f"insert into purchase_lines(purchase_id,kind,description,quantity,unit_cost) values ('9c0000{d:02d}-0000-0000-0000-00000000000a','expense','x',1,{500+d});")
    print(f"insert into purchases(id,branch_id,status,created_at) values ('9d0000{d:02d}-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','cancelled','2026-09-{d:02d} 09:30:00+05:45');")
    print(f"insert into purchase_lines(purchase_id,kind,description,quantity,unit_cost) values ('9d0000{d:02d}-0000-0000-0000-00000000000a','expense','x',1,5555);")
PY
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d rt -f /tmp/h/trend_seed.sql" 2>&1 | head -3
# Ask the helper what the card would request for "7 days" ending 2026-09-21
read PF PT < <(node -e "import('/tmp/h/trendMath.mjs').then(m=>{const p=m.previousRange('2026-09-15','2026-09-21');console.log(p.from,p.to)})")
tot() { su postgres -c "psql -d rt -tA -F' ' -c \"select coalesce(sum(revenue),0), coalesce(sum(purchases),0), count(*) from daily_revenue_vs_purchases('$BR','$1','$2')\""; }
echo "card asks the database for:  this week 2026-09-15..2026-09-21   previous week $PF..$PT"
echo "this week (from the real function):     sales / purchases / rows = $(tot 2026-09-15 2026-09-21)"
echo "previous week (from the real function): sales / purchases / rows = $(tot $PF $PT)"
python3 - <<'PY'
cur_s = sum(1000+10*d for d in range(15,22)); cur_p = sum(500+d for d in range(15,22))
prv_s = sum(1000+10*d for d in range(8,15));  prv_p = sum(500+d for d in range(8,15))
print(f"expected this week:                     sales / purchases            = {cur_s}.00 {cur_p}.00")
print(f"expected previous week:                 sales / purchases            = {prv_s}.00 {prv_p}.00")
print(f"expected change on the card:            sales {round((cur_s-prv_s)/prv_s*100)}%  purchases {round((cur_p-prv_p)/prv_p*100)}%")
PY
