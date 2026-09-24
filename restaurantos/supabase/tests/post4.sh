#!/bin/bash
source /tmp/h/lib.sh; source /tmp/h/check.sh
/tmp/h/apply020.sh >/dev/null 2>&1
su postgres -c "psql -1 -q -v ON_ERROR_STOP=1 -d rt -f /home/claude/restaurantos/supabase/migrations/021_atomic_payments.sql" >/dev/null 2>&1
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d rt -f /tmp/h/extras.sql"
BR=aaaaaaaa-0000-0000-0000-00000000000a; CASH=c1000000-0000-0000-0000-00000000000a; ACCT=d1000000-0000-0000-0000-00000000000a
# Dedicated fresh tables for this file's tests — e1/e2 already have orders
# from seed.sql/extras.sql, so reusing them would collide with the new
# "one open order per table" rule for reasons that have nothing to do with
# what's actually being tested here.
su postgres -c "psql -q -d rt -c \"insert into restaurant_tables(id,branch_id,label) values ('e3000000-0000-0000-0000-00000000000a','$BR','Table 3'),('e4000000-0000-0000-0000-00000000000a','$BR','Table 4')\""
T1=e3000000-0000-0000-0000-00000000000a; T2=e4000000-0000-0000-0000-00000000000a
run_json() { as "$1" "$2" "select $3;"; }
echo "== BASIC CORRECTNESS =="
su postgres -c "psql -q -d rt -c \"insert into orders(id,branch_id,table_id,status,total) values ('11110000-0000-0000-0000-000000000001','$BR','$T2','open',500)\""
R=$(as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('key','cash','amount',500)), '{}', null, 500,0,0,0,0,500,1,null);")
ok "cashier (has 'billing') completes an exact cash payment" "$R"
eq "  order now paid"     "$(su_ "select status from orders where id='11110000-0000-0000-0000-000000000001'")" "paid"
eq "  a payments row exists" "$(su_ "select amount from payments where order_id='11110000-0000-0000-0000-000000000001'")" "500.00"
eq "  balance went up by exactly 500" "$(su_ "select balance from accounts where id='$ACCT'")" "1500.00"
eq "  a ledger entry exists"  "$(su_ "select count(*) from ledger_entries where order_id='11110000-0000-0000-0000-000000000001' and reason='order payment'")" "1"
eq "  table freed"          "$(su_ "select status from restaurant_tables where id='$T2'")" "needs_cleaning"

echo "== CHANGE GIVEN =="
su_ "update restaurant_tables set status='available' where id='$T2'" >/dev/null
su postgres -c "psql -q -d rt -c \"insert into orders(id,branch_id,table_id,status,total) values ('11110000-0000-0000-0000-000000000002','$BR','$T2','open',340)\""
BAL_BEFORE=$(su_ "select balance from accounts where id='$ACCT'")
as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000002', jsonb_build_array(jsonb_build_object('key','cash','amount',1000)), '{}', null, 340,0,0,0,0,340,1,null);" >/dev/null
eq "  customer hands 1000 for a 340 bill -> balance up by the order TOTAL (340) net of change" "$(su_ "select balance from accounts where id='$ACCT'")" "$(echo "$BAL_BEFORE + 340" | bc)"
eq "  change-given ledger line exists"  "$(su_ "select amount from ledger_entries where order_id='11110000-0000-0000-0000-000000000002' and reason='Change given to customer'")" "-660.00"
eq "  due_amount is 0 (fully covered)" "$(su_ "select due_amount from orders where id='11110000-0000-0000-0000-000000000002'")" "0.00"

echo "== THE EXACT BUG FROM THE LIVE DATA: DOUBLE-TAP / RETRY =="
su_ "update restaurant_tables set status='available' where id='$T2'" >/dev/null
su postgres -c "psql -q -d rt -c \"insert into orders(id,branch_id,table_id,status,total) values ('11110000-0000-0000-0000-000000000003','$BR','$T2','open',90)\""
BAL_BEFORE=$(su_ "select balance from accounts where id='$ACCT'")
FIRST=$(as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000003', jsonb_build_array(jsonb_build_object('key','cash','amount',90)), '{}', null, 90,0,0,0,0,90,1,null);")
ok "  first tap succeeds" "$FIRST"
SECOND=$(as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000003', jsonb_build_array(jsonb_build_object('key','cash','amount',90)), '{}', null, 90,0,0,0,0,90,1,null);")
deny "  the RETRY on the same order is refused (this is the Aug 12-25 bug — no longer possible)" "$SECOND"
eq "  only ONE payments row exists"  "$(su_ "select count(*) from payments where order_id='11110000-0000-0000-0000-000000000003'")" "1"
eq "  balance only went up by 90, not 180"  "$(su_ "select balance from accounts where id='$ACCT'")" "$(echo "$BAL_BEFORE + 90" | bc)"

echo "== A FAILURE PARTWAY THROUGH LEAVES NOTHING BEHIND (the Sep 13 bug) =="
su postgres -c "psql -q -d rt -c \"insert into orders(id,branch_id,table_id,status,total) values ('11110000-0000-0000-0000-000000000004','$BR','$T1','open',65)\""
BAL_BEFORE=$(su_ "select balance from accounts where id='$ACCT'")
# Reference a payment method that doesn't exist for this branch -> must fail and roll back EVERYTHING, including the part that would have succeeded.
FAIL=$(as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000004', jsonb_build_array(jsonb_build_object('key','cash','amount',25),jsonb_build_object('key','esewa','amount',40)), '{}', null, 65,0,0,0,0,65,1,null);")
deny "  a payment referencing an unknown method is refused" "$FAIL"
eq "  the order was NOT left half-paid: still open" "$(su_ "select status from orders where id='11110000-0000-0000-0000-000000000004'")" "open"
eq "  NO payments row from the failed attempt (not even the cash half)" "$(su_ "select count(*) from payments where order_id='11110000-0000-0000-0000-000000000004'")" "0"
eq "  balance completely unchanged (not even +25 from the cash half)" "$(su_ "select balance from accounts where id='$ACCT'")" "$BAL_BEFORE"

su_ "update orders set status='cancelled' where id='11110000-0000-0000-0000-000000000004'" >/dev/null  # free $T1 for the tests below; order 4 staying open was the point already proven above
echo "== PERMISSIONS =="
deny "kitchen staff (no 'billing') can't complete a payment" "$(as $STORE_A s@x "select complete_payment('11110000-0000-0000-0000-000000000004', jsonb_build_array(jsonb_build_object('key','cash','amount',65)), '{}', null, 65,0,0,0,0,65,1,null);")"
deny "fired waiter can't complete a payment" "$(as $FIRED_A f@x "select complete_payment('11110000-0000-0000-0000-000000000004', jsonb_build_array(jsonb_build_object('key','cash','amount',65)), '{}', null, 65,0,0,0,0,65,1,null);")"

echo "== A PAID ORDER CAN'T BE BILLED AGAIN =="
deny "billing order 1 (already paid) a second time" "$(as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('key','cash','amount',100)), '{}', null, 100,0,0,0,0,100,1,null);")"

echo "== PARTIAL PAYMENT (table stays open) =="
su postgres -c "psql -q -d rt -c \"insert into orders(id,branch_id,table_id,status,total) values ('11110000-0000-0000-0000-000000000005','$BR','$T1','open',400)\""
ok "cashier records a partial payment"  "$(as $CASHIER_A c@x "select record_order_payment('11110000-0000-0000-0000-000000000005', jsonb_build_array(jsonb_build_object('key','cash','amount',150)));")"
eq "  order status untouched (still open)"  "$(su_ "select status from orders where id='11110000-0000-0000-0000-000000000005'")" "open"
eq "  money still landed in the account"    "$(su_ "select count(*) from payments where order_id='11110000-0000-0000-0000-000000000005'")" "1"
FINISH=$(as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000005', jsonb_build_array(jsonb_build_object('key','cash','amount',250)), '{}', null, 400,0,0,0,0,400,1,null);")
ok "  finishing the bill accounts for the earlier partial payment" "$FINISH"
eq "  due_amount is 0 (150 partial + 250 final = 400)"  "$(su_ "select due_amount from orders where id='11110000-0000-0000-0000-000000000005'")" "0.00"
eq "  exactly two payments rows total"  "$(su_ "select count(*) from payments where order_id='11110000-0000-0000-0000-000000000005'")" "2"

echo "== MERGED TABLES =="
su postgres -c "psql -q -d rt" <<SQL
insert into orders(id,branch_id,table_id,status,total) values ('11110000-0000-0000-0000-000000000006','$BR','$T1','open',200);
insert into restaurant_tables(id,branch_id,label) values ('e9000000-0000-0000-0000-00000000000a','$BR','Table 9');
insert into orders(id,branch_id,table_id,status,total,merged_into_order_id) values ('11110000-0000-0000-0000-000000000007','$BR','e9000000-0000-0000-0000-00000000000a','open',100,'11110000-0000-0000-0000-000000000006');
SQL
ok "billing a merged pair"  "$(as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000006', jsonb_build_array(jsonb_build_object('key','cash','amount',300)), ARRAY['11110000-0000-0000-0000-000000000007']::uuid[], null, 300,0,0,0,0,300,1,null);")"
eq "  the merged order is ALSO paid" "$(su_ "select status from orders where id='11110000-0000-0000-0000-000000000007'")" "paid"
COUNT_FREED=$(su_ "select count(*) from restaurant_tables where id in ('$T1','e9000000-0000-0000-0000-00000000000a') and status='needs_cleaning'")
eq "  BOTH tables freed (count=2)" "$COUNT_FREED" "2"
deny "a table someone else merged elsewhere can't be dragged in as a fake merge" "$(as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000005', jsonb_build_array(jsonb_build_object('key','cash','amount',0)), ARRAY['11110000-0000-0000-0000-000000000001']::uuid[], null, 0,0,0,0,0,0,1,null);")"

echo "== CUSTOMER DUE TRACKING =="
su postgres -c "psql -q -d rt -c \"insert into customers(id,branch_id,name,lifetime_spend,loyalty_points,outstanding_due) values ('c9000000-0000-0000-0000-00000000000a','$BR','Regular',0,0,0)\""
su postgres -c "psql -q -d rt -c \"insert into orders(id,branch_id,table_id,status,total) values ('11110000-0000-0000-0000-000000000008','$BR','$T1','open',600)\""
as $CASHIER_A c@x "select complete_payment('11110000-0000-0000-0000-000000000008', jsonb_build_array(jsonb_build_object('key','cash','amount',400)), '{}', 'c9000000-0000-0000-0000-00000000000a', 600,0,0,0,0,600,1,null);" >/dev/null
eq "  customer's due went up by the unpaid 200"    "$(su_ "select outstanding_due from customers where id='c9000000-0000-0000-0000-00000000000a'")" "200.00"
eq "  lifetime spend = full bill (600), not just what was paid"  "$(su_ "select lifetime_spend from customers where id='c9000000-0000-0000-0000-00000000000a'")" "600.00"
eq "  loyalty points = round(600/100) = 6"  "$(su_ "select loyalty_points from customers where id='c9000000-0000-0000-0000-00000000000a'")" "6"

echo "== STAFF / NO-CHARGE CLOSE =="
su postgres -c "psql -q -d rt -c \"insert into orders(id,branch_id,table_id,status,total) values ('11110000-0000-0000-0000-000000000009','$BR','$T2','open',80)\""
BAL_BEFORE=$(su_ "select balance from accounts where id='$ACCT'")
ok "cashier closes a staff table" "$(as $CASHIER_A c@x "select close_no_charge_order('11110000-0000-0000-0000-000000000009', '{}', 80, 80, 'staff meal');")"
eq "  marked paid + is_staff_order" "$(su_ "select status || '/' || is_staff_order from orders where id='11110000-0000-0000-0000-000000000009'")" "paid/true"
eq "  no money moved" "$(su_ "select balance from accounts where id='$ACCT'")" "$BAL_BEFORE"
deny "closing the SAME staff table twice"  "$(as $CASHIER_A c@x "select close_no_charge_order('11110000-0000-0000-0000-000000000009', '{}', 80, 80, null);")"
summary
