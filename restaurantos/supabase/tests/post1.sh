#!/bin/bash
source /tmp/h/lib.sh; source /tmp/h/check.sh
/tmp/h/apply020.sh >/dev/null 2>&1
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d rt -f /tmp/h/extras.sql"
SHARE_A=aaaaaaaa-1111-1111-1111-111111111111; ADMIN2_A=aaaaaaaa-2222-2222-2222-222222222222
M1=a2000000-0000-0000-0000-000000000002; M2=a3000000-0000-0000-0000-000000000003; W=a4000000-0000-0000-0000-000000000004
AD=a1000000-0000-0000-0000-000000000001; SH=a0000000-0000-0000-0000-00000000a001
echo "== ACCESS =="
eq   "fired waiter reads orders" "$(as $FIRED_A f@x 'select count(*) from orders;')" "0"
eq   "fired waiter reads staff list" "$(as $FIRED_A f@x 'select count(*) from staff;')" "0"
eq   "active waiter still reads own cafe orders (regression)" "$(as $WAITER_A w@x 'select count(*) from orders;')" "3"
eq   "Cafe B admin sees none of Cafe A's orders" "$(as $ADMIN_B b@x 'select count(*) from orders;')" "0"
deny "anon reads branches table" "$(su postgres -c "psql -d rt -tA -c \"set role anon; select count(*) from branches;\"" 2>&1 | grep -v '^SET' | sed 's/.*ERROR: */ERR: /')"
eq   "anon lookup by code 'CAFEA ' returns name only" "$(su postgres -c "psql -d rt -tA -c \"set role anon; select name from lookup_branch_by_code(' CAFEA ');\"" | grep -v '^SET')" "Cafe A"
eq   "anon lookup by wildcard '%' returns nothing" "$(su postgres -c "psql -d rt -tA -c \"set role anon; select count(*) from lookup_branch_by_code('%');\"" | grep -v '^SET')" "0"
echo "== HIERARCHY =="
deny "manager promotes SELF to admin"                "$(as $MGR_A m@x "$(cnt "update staff set role='admin' where id='$M1'")")"
deny "manager edits the OTHER manager"               "$(as $MGR_A m@x "$(cnt "update staff set name='hacked' where id='$M2'")")"
deny "manager edits the admin"                       "$(as $MGR_A m@x "$(cnt "update staff set name='hacked' where id='$AD'")")"
deny "manager deactivates the admin"                 "$(as $MGR_A m@x "$(cnt "update staff set is_active=false where id='$AD'")")"
ok   "manager renames a waiter (legit)"              "$(as $MGR_A m@x "update staff set name='Waiter A (renamed)' where id='$W';")"
eq   "  ...and it really changed"                   "$(su_ "select name from staff where id='$W'")" "Waiter A (renamed)"
ok   "manager changes waiter -> cashier (legit)"     "$(as $MGR_A m@x "update staff set role='cashier' where id='$W';")"
deny "manager promotes waiter to MANAGER"            "$(as $MGR_A m@x "update staff set role='manager' where id='$W';")"
deny "manager promotes waiter to shareholder"        "$(as $MGR_A m@x "update staff set role='shareholder' where id='$W';")"
deny "manager promotes waiter to admin"              "$(as $MGR_A m@x "update staff set role='admin' where id='$W';")"
su_ "update staff set role='waiter' where id='$W'" >/dev/null
ok   "manager adds a new waiter (legit)"             "$(as $MGR_A m@x "insert into staff(branch_id,name,email,role) values ('aaaaaaaa-0000-0000-0000-00000000000a','Fresh Waiter','fresh@x.com','waiter');")"
deny "manager adds an ADMIN"                         "$(as $MGR_A m@x "insert into staff(branch_id,name,email,role) values ('aaaaaaaa-0000-0000-0000-00000000000a','Evil','evil@x.com','admin');")"
deny "manager adds a SHAREHOLDER"                    "$(as $MGR_A m@x "insert into staff(branch_id,name,email,role) values ('aaaaaaaa-0000-0000-0000-00000000000a','Evil2','evil2@x.com','shareholder');")"
deny "manager adds a MANAGER"                        "$(as $MGR_A m@x "insert into staff(branch_id,name,email,role) values ('aaaaaaaa-0000-0000-0000-00000000000a','Evil3','evil3@x.com','manager');")"
deny "manager adds staff into the OTHER cafe"        "$(as $MGR_A m@x "insert into staff(branch_id,name,email,role) values ('bbbbbbbb-0000-0000-0000-00000000000b','Spy','spy@x.com','waiter');")"
deny "manager adds a row pre-linked to someone's login" "$(as $MGR_A m@x "insert into staff(branch_id,name,email,role,auth_user_id) values ('aaaaaaaa-0000-0000-0000-00000000000a','Hijack','hj@x.com','waiter','$ADMIN_A');")"
deny "duplicate staff email in the same cafe"        "$(as $ADMIN_A a@x "insert into staff(branch_id,name,email,role) values ('aaaaaaaa-0000-0000-0000-00000000000a','Dup','FRESH@x.com ','waiter');")"
deny "plain waiter edits staff"                      "$(as $WAITER_A w@x "$(cnt "update staff set name='x' where id='$W'")")"
deny "shareholder (no 'staff' permission) edits a waiter" "$(as $SHARE_A s@x "$(cnt "update staff set name='x' where id='$W'")")"
ok   "ADMIN makes a shareholder (legit)"             "$(as $ADMIN_A a@x "update staff set role='shareholder' where id='$W';")"
eq   "  ...and it really changed"                    "$(su_ "select role from staff where id='$W'")" "shareholder"
su_ "update staff set role='waiter' where id='$W'" >/dev/null
ok   "ADMIN promotes a manager to admin (legit)"     "$(as $ADMIN_A a@x "update staff set role='admin' where id='$M2';")"
su_ "update staff set role='manager' where id='$M2'" >/dev/null
deny "admin changes their OWN role"                  "$(as $ADMIN_A a@x "update staff set role='manager' where id='$AD';")"
deny "admin deactivates THEMSELVES"                  "$(as $ADMIN_A a@x "update staff set is_active=false where id='$AD';")"
deny "admin deletes THEMSELVES"                      "$(as $ADMIN_A a@x "$(cnt "delete from staff where id='$AD'")")"
ok   "admin renames themselves (legit)"              "$(as $ADMIN_A a@x "update staff set name='Admin A!' where id='$AD';")"
deny "admin re-wires someone's sign-in link by hand" "$(as $ADMIN_A a@x "update staff set auth_user_id='$ADMIN_B' where id='$W';")"
ok   "admin deactivates a manager (legit)"           "$(as $ADMIN_A a@x "update staff set is_active=false where id='$M2';")"
su_ "update staff set is_active=true where id='$M2'" >/dev/null
echo "== PERMISSION OVERRIDES =="
ok   "manager grants a waiter a permission (legit)"  "$(as $MGR_A m@x "insert into permissions(staff_id,feature_key,allowed) values ('$W','reports',true);")"
deny "manager grants ITSELF... via another manager's row" "$(as $MGR_A m@x "insert into permissions(staff_id,feature_key,allowed) values ('$M2','settings',false);")"
deny "waiter grants themself a permission"           "$(as $WAITER_A w@x "insert into permissions(staff_id,feature_key,allowed) values ('$W','staff',true);")"
deny "manager edits admin's permissions"             "$(as $MGR_A m@x "insert into permissions(staff_id,feature_key,allowed) values ('$AD','staff',false);")"
ok   "admin sets a manager's permission (legit)"     "$(as $ADMIN_A a@x "insert into permissions(staff_id,feature_key,allowed) values ('$M1','settings',false);")"
echo "== ADMIN CAN'T BE LOCKED OUT BY AN OVERRIDE =="
su_ "insert into permissions(staff_id,feature_key,allowed) values ('$AD','staff',false)" >/dev/null
ok   "admin with an explicit 'staff=false' override still manages staff" "$(as $ADMIN_A a@x "update staff set name='Waiter still editable' where id='$W';")"
summary
