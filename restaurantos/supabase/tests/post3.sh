#!/bin/bash
source /tmp/h/lib.sh; source /tmp/h/check.sh
/tmp/h/apply020.sh >/dev/null 2>&1
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d rt -f /tmp/h/extras.sql"
SHARE_A=aaaaaaaa-1111-1111-1111-111111111111; BR=aaaaaaaa-0000-0000-0000-00000000000a
W=a4000000-0000-0000-0000-000000000004
echo "== LOGIN ACTIVITY =="
deny "waiter reads login_events directly"        "$(as $WAITER_A w@x 'select count(*) from login_events;')"
deny "waiter writes login_events directly"       "$(as $WAITER_A w@x "insert into login_events(branch_id,staff_id) values ('$BR','$W');")"
as $WAITER_A w@x "select record_login_event();" >/dev/null
eq   "waiter opens the app -> 1 visit recorded"  "$(su_ "select count(*) from login_events where staff_id='$W'")" "1"
as $WAITER_A w@x "select record_login_event();" >/dev/null
eq   "opens again within 30 min -> still 1"       "$(su_ "select count(*) from login_events where staff_id='$W'")" "1"
su_ "update login_events set seen_at = now() - interval '31 minutes' where staff_id='$W'" >/dev/null
as $WAITER_A w@x "select record_login_event();" >/dev/null
eq   "opens 31 min later -> a second visit"      "$(su_ "select count(*) from login_events where staff_id='$W'")" "2"
as $FIRED_A f@x "select record_login_event();" >/dev/null
eq   "deactivated user opening the app records nothing" "$(su_ "select count(*) from login_events where staff_id='a6000000-0000-0000-0000-000000000006'")" "0"
as $SHARE_A s@x "select record_login_event();" >/dev/null
ok   "ADMIN reads login activity"                 "$(as $ADMIN_A a@x "select count(*) from login_activity(current_date-2, current_date+1);")"
eq   "  ...shows the waiter's visits today (2 visits, one day-row)" "$(as $ADMIN_A a@x "select visits from login_activity(current_date-2, current_date+1) where staff_id='$W' order by day desc limit 1;")" "2"
eq   "  ...last-seen lists both people seen"      "$(as $ADMIN_A a@x "select count(*) from login_last_seen();")" "2"
deny "MANAGER reads login activity"               "$(as $MGR_A m@x "select count(*) from login_activity(current_date-2, current_date+1);")"
deny "SHAREHOLDER reads login activity"           "$(as $SHARE_A s@x "select count(*) from login_activity(current_date-2, current_date+1);")"
deny "waiter reads last-seen"                     "$(as $WAITER_A w@x "select count(*) from login_last_seen();")"
eq   "Cafe B's admin sees none of Cafe A's activity" "$(as $ADMIN_B b@x "select count(*) from login_activity(current_date-2, current_date+1);")" "0"
deny "anon calls record_login_event"              "$(su postgres -c "psql -d rt -tA -c \"set role anon; select record_login_event();\"" 2>&1 | grep -v '^SET' | sed 's/.*ERROR: */ERR: /')"
echo "== SIGN-IN LINKING =="
NEWROW=a9000000-0000-0000-0000-000000000009
as $NEWHIRE newhire@example.com "select link_staff_account('cafea');" >/dev/null
eq   "UNVERIFIED email can't claim the staff record" "$(su_ "select auth_user_id is not null from staff where id='$NEWROW'")" "f"
su_ "update auth.users set email_confirmed_at = now() where id='$NEWHIRE'" >/dev/null
as $NEWHIRE newhire@example.com "select link_staff_account('cafeb');" >/dev/null
eq   "verified email + WRONG cafe code claims nothing" "$(su_ "select auth_user_id is not null from staff where id='$NEWROW'")" "f"
as $NEWHIRE newhire@example.com "select link_staff_account('cafea');" >/dev/null
eq   "verified email + right cafe code links (legit)"  "$(su_ "select auth_user_id is not null from staff where id='$NEWROW'")" "t"
eq   "  ...and now that person can read their cafe"    "$(as $NEWHIRE newhire@example.com 'select count(*) from orders;')" "3"
echo "== RULES THE DATABASE ENFORCES =="
deny "second open order on a table that already has one" "$(as $WAITER_A w@x "insert into orders(branch_id,table_id,status) values ('$BR','e2000000-0000-0000-0000-00000000000a','open');")"
ok   "a NEW order on a free table is fine"             "$(as $WAITER_A w@x "insert into orders(branch_id,table_id,status) values ('$BR','e1000000-0000-0000-0000-00000000000a','open');")"
su_ "insert into shifts(branch_id,status) values ('$BR','open')" >/dev/null
deny "a second OPEN shift in the same cafe"            "$(as $ADMIN_A a@x "insert into shifts(branch_id,status) values ('$BR','open');")"
ok   "an open shift in the OTHER cafe is fine"         "$(as $ADMIN_B b@x "insert into shifts(branch_id,status) values ('bbbbbbbb-0000-0000-0000-00000000000b','open');")"
deny "duplicate table name 'table 1 '"                "$(as $ADMIN_A a@x "insert into restaurant_tables(branch_id,label) values ('$BR','table 1 ');")"
deny "duplicate table name 'TABLE 2'"                 "$(as $ADMIN_A a@x "insert into restaurant_tables(branch_id,label) values ('$BR','TABLE 2');")"
su_ "update restaurant_tables set is_archived=true where id='e2000000-0000-0000-0000-00000000000a'" >/dev/null
ok   "re-using the name of an ARCHIVED table is fine"  "$(as $ADMIN_A a@x "insert into restaurant_tables(branch_id,label) values ('$BR','Table 2');")"
echo "== CAFE DETAILS =="
eq   "staff can still read their own cafe's row (regression)" "$(as $WAITER_A w@x 'select count(*) from branches;')" "1"
eq   "  ...and only their own"                          "$(as $WAITER_A w@x "select count(*) from branches where code='cafeb';")" "0"
deny "waiter edits the cafe's details"                  "$(as $WAITER_A w@x "$(cnt "update branches set phone='0' where code='cafea'")")"
ok   "manager (has 'settings') edits cafe details"       "$(as $MGR_A m@x "update branches set phone='9800000009' where code='cafea';")"
echo "== PERMISSION TABLE (what each role gets by default) =="
for spec in "$SHARE_A|shareholder" "$MGR_A|manager" "$CASHIER_A|cashier" "$WAITER_A|waiter" "$STORE_A|store" "$ADMIN_A|admin"; do
  uid=${spec%%|*}; name=${spec##*|}
  row=$(as $uid x@x "select string_agg(f || '=' || case when current_staff_has_permission(f) then 'Y' else '-' end, ' ' order by f) from unnest(array['cancel_orders','adjust_balances','staff','settings','financials','purchasing','billing']) f;")
  echo "  $name: $row"
done
eq "manager: can adjust balances, can NOT cancel billed orders" "$(as $MGR_A x@x "select current_staff_has_permission('adjust_balances') and not current_staff_has_permission('cancel_orders') and current_staff_has_permission('staff') and current_staff_has_permission('billing');")" "t"
eq "shareholder: can cancel, can't adjust/staff/settings" "$(as $SHARE_A x@x "select current_staff_has_permission('cancel_orders') and not current_staff_has_permission('adjust_balances') and not current_staff_has_permission('staff') and not current_staff_has_permission('settings') and current_staff_has_permission('financials');")" "t"
summary
