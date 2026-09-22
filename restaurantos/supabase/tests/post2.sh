#!/bin/bash
source /tmp/h/lib.sh; source /tmp/h/check.sh
/tmp/h/apply020.sh >/dev/null 2>&1
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d rt -f /tmp/h/extras.sql"
SHARE_A=aaaaaaaa-1111-1111-1111-111111111111; SH=a0000000-0000-0000-0000-00000000a001
ACCT=d1000000-0000-0000-0000-00000000000a; CASHMETH=c1000000-0000-0000-0000-00000000000a; BR=aaaaaaaa-0000-0000-0000-00000000000a
NEPAL_TODAY="(date_trunc('day', now() at time zone 'Asia/Kathmandu') at time zone 'Asia/Kathmandu')"
# make the "old" order genuinely yesterday (Nepal time), and add three more paid orders for today
su_ "update orders set closed_at = $NEPAL_TODAY - interval '1 hour' where id='$OLD_ORDER'" >/dev/null
su postgres -c "psql -q -d rt" <<SQL
set session_replication_role = replica;
insert into orders(id,branch_id,table_id,status,total,closed_at) values
 ('f4000000-0000-0000-0000-00000000000a','$BR','e1000000-0000-0000-0000-00000000000a','paid',100,now()),
 ('f5000000-0000-0000-0000-00000000000a','$BR','e1000000-0000-0000-0000-00000000000a','paid',100,now()),
 ('f6000000-0000-0000-0000-00000000000a','$BR','e1000000-0000-0000-0000-00000000000a','paid',100,now());
insert into payments(order_id,payment_method_id,amount) select id,'$CASHMETH',100 from orders where id in ('f4000000-0000-0000-0000-00000000000a','f5000000-0000-0000-0000-00000000000a','f6000000-0000-0000-0000-00000000000a');
SQL
O4=f4000000-0000-0000-0000-00000000000a; O5=f5000000-0000-0000-0000-00000000000a; O6=f6000000-0000-0000-0000-00000000000a
echo "== CANCELLING PAID ORDERS =="
deny "waiter cancels a paid order"                    "$(as $WAITER_A w@x "select cancel_order('$TODAY_ORDER', $NEPAL_TODAY);")"
deny "cashier cancels a paid order (default: no)"     "$(as $CASHIER_A c@x "select cancel_order('$TODAY_ORDER', $NEPAL_TODAY);")"
deny "store user cancels a paid order"                "$(as $STORE_A s@x "select cancel_order('$TODAY_ORDER', $NEPAL_TODAY);")"
deny "manager reaches yesterday's order with a fake date"  "$(as $MGR_A m@x "select cancel_order('$OLD_ORDER', '2000-01-01');")"
deny "admin reaches yesterday's order with a fake date"    "$(as $ADMIN_A a@x "select cancel_order('$OLD_ORDER', '2000-01-01');")"
deny "admin reaches yesterday's order with NO date (null)" "$(as $ADMIN_A a@x "select cancel_order('$OLD_ORDER', null);")"
ok   "SHAREHOLDER cancels today's paid order (allowed)"     "$(as $SHARE_A s@x "select cancel_order('$TODAY_ORDER', $NEPAL_TODAY);")"
eq   "  order is now cancelled"                       "$(su_ "select status from orders where id='$TODAY_ORDER'")" "cancelled"
eq   "  ...signed by the shareholder"                 "$(su_ "select cancelled_by = '$SH' from orders where id='$TODAY_ORDER'")" "t"
eq   "  ...money taken back out (1000 - 300)"          "$(su_ "select balance from accounts where id='$ACCT'")" "700.00"
eq   "  ...and a ledger entry records it"             "$(su_ "select count(*) from ledger_entries where order_id='$TODAY_ORDER' and reason='order cancelled'")" "1"
deny "cancelling the same order AGAIN (money can't reverse twice)" "$(as $ADMIN_A a@x "select cancel_order('$TODAY_ORDER', $NEPAL_TODAY);")"
eq   "  balance unchanged by the second attempt"      "$(su_ "select balance from accounts where id='$ACCT'")" "700.00"
deny "MANAGER cancels an already-billed order (default: no)" "$(as $MGR_A m@x "select cancel_order('$O4', $NEPAL_TODAY);")"
su_ "insert into permissions(staff_id,feature_key,allowed) values ('a5000000-0000-0000-0000-000000000005','cancel_orders',true),('a2000000-0000-0000-0000-000000000002','cancel_orders',true),('a0000000-0000-0000-0000-00000000a001','cancel_orders',false),('a1000000-0000-0000-0000-000000000001','cancel_orders',false)" >/dev/null
ok   "cashier GRANTED 'cancel_orders' can cancel"      "$(as $CASHIER_A c@x "select cancel_order('$O5', $NEPAL_TODAY);")"
ok   "manager GRANTED 'cancel_orders' by the admin can"  "$(as $MGR_A m@x "select cancel_order('$O4', $NEPAL_TODAY);")"
deny "shareholder with 'cancel_orders' switched OFF can't" "$(as $SHARE_A s@x "select cancel_order('$O6', $NEPAL_TODAY);")"
ok   "admin can't be switched off (override ignored)"   "$(as $ADMIN_A a@x "select cancel_order('$O6', $NEPAL_TODAY);")"
echo "== CANCELLING PURCHASES =="
deny "waiter cancels a purchase"                       "$(as $WAITER_A w@x "select cancel_purchase('9a000000-0000-0000-0000-00000000000a', $NEPAL_TODAY);")"
deny "store user reaches a 3-day-old purchase with fake date" "$(as $STORE_A s@x "select cancel_purchase('9b000000-0000-0000-0000-00000000000a', '2000-01-01');")"
ok   "store user cancels today's purchase (has 'purchasing')" "$(as $STORE_A s@x "select cancel_purchase('9a000000-0000-0000-0000-00000000000a', $NEPAL_TODAY);")"
eq   "  ...signed by them"                            "$(su_ "select cancelled_by = 'a8000000-0000-0000-0000-000000000008' from purchases where id='9a000000-0000-0000-0000-00000000000a'")" "t"
echo "== CORRECTING ACCOUNT BALANCES =="
deny "shareholder corrects a balance"                  "$(as $SHARE_A s@x "select increment_balance('$ACCT', 50, 'Balance adjustment: recount');")"
deny "waiter corrects a balance"                       "$(as $WAITER_A w@x "select increment_balance('$ACCT', 50, 'Balance adjustment: recount');")"
ok   "manager corrects a balance (as today)"           "$(as $MGR_A m@x "select increment_balance('$ACCT', 50, 'Balance adjustment: recount');")"
ok   "admin corrects a balance"                        "$(as $ADMIN_A a@x "select increment_balance('$ACCT', -50, 'Balance adjustment: recount');")"
ok   "waiter's NORMAL deposit still works (regression)" "$(as $WAITER_A w@x "select increment_balance('$ACCT', 10, 'order payment');")"
ok   "shareholder's normal deposit still works"        "$(as $SHARE_A s@x "select increment_balance('$ACCT', 10, 'order payment');")"
echo "== RECORDS THAT SHOULD NEVER BE EDITED =="
deny "waiter rewrites a payment amount"                "$(as $WAITER_A w@x "$(cnt "update payments set amount=1 where order_id='$O5'")")"
deny "manager rewrites a payment amount"               "$(as $MGR_A m@x "$(cnt "update payments set amount=1 where order_id='$O5'")")"
deny "admin rewrites a payment amount"                 "$(as $ADMIN_A a@x "$(cnt "update payments set amount=1 where order_id='$O5'")")"
deny "waiter deletes a payment"                        "$(as $WAITER_A w@x "$(cnt "delete from payments where order_id='$O5'")")"
ok   "waiter ADDS a payment to an open bill (legit)"   "$(as $WAITER_A w@x "insert into payments(order_id,payment_method_id,amount) values ('f3000000-0000-0000-0000-00000000000a','$CASHMETH',150);")"
deny "payment on an already-paid bill (016 still works)" "$(as $WAITER_A w@x "insert into payments(order_id,payment_method_id,amount) values ('$O5','$CASHMETH',5);")"
deny "waiter edits a stock movement"                   "$(as $WAITER_A w@x "$(cnt "update stock_movements set quantity=999")")"
echo "== STOCK MATH =="
ITEM=a1a10000-0000-0000-0000-00000000000a
as $WAITER_A w@x "select increment_stock('$ITEM', -5, 'sale_deduction');" >/dev/null
eq   "sell 5 of 2 in stock -> shows -3 (not clamped)"  "$(su_ "select current_stock from inventory_items where id='$ITEM'")" "-3.000"
as $WAITER_A w@x "select increment_stock('$ITEM', 5, 'adjustment', 'void');" >/dev/null
eq   "void it -> back to exactly 2 (was 5 before the fix)" "$(su_ "select current_stock from inventory_items where id='$ITEM'")" "2.000"
eq   "  movements now record WHO did it"              "$(su_ "select count(*) from stock_movements where inventory_item_id='$ITEM' and created_by='a4000000-0000-0000-0000-000000000004'")" "2"
summary
