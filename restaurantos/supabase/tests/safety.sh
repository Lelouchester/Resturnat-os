#!/bin/bash
MIG=${REPO_SQL:-/home/claude/restaurantos/supabase}/migrations/020_roles_security_hardening.sql
run() { su postgres -c "psql -1 -q -v ON_ERROR_STOP=1 -d rt -f $MIG" 2>&1 | grep -v "NOTICE\|^$"; }
psqlc() { su postgres -c "psql -d rt -tAc \"$1\""; }
/tmp/h/up.sh
echo "===== IDEMPOTENT: apply 020, then apply it AGAIN ====="
/tmp/h/rebuild.sh >/dev/null 2>&1; run; run; echo "both runs finished with exit code $?  (0 = fine)"
echo
echo "===== PRE-FLIGHT 1: a table with TWO open orders ====="
/tmp/h/rebuild.sh >/dev/null 2>&1
psqlc "set session_replication_role=replica; insert into orders(branch_id,table_id,status) values ('aaaaaaaa-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','open'),('aaaaaaaa-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','open');" >/dev/null
run | head -2
echo "-> new role added anyway?   $(psqlc "select count(*) from pg_enum where enumlabel='shareholder'")   (0 = the migration changed NOTHING)"
echo "-> new function created?    $(psqlc "select count(*) from pg_proc where proname='staff_role_rank'")   (0 = the migration changed NOTHING)"
echo
echo "===== PRE-FLIGHT 2: a cafe with NO active administrator ====="
/tmp/h/rebuild.sh >/dev/null 2>&1
psqlc "update staff set role='manager' where role::text='admin' and branch_id='bbbbbbbb-0000-0000-0000-00000000000b'" >/dev/null
run | head -2
echo
echo "===== PRE-FLIGHT 3: the same email twice in one cafe ====="
/tmp/h/rebuild.sh >/dev/null 2>&1
psqlc "insert into staff(branch_id,name,email,role) values ('aaaaaaaa-0000-0000-0000-00000000000a','Dup','WAITERA@x.com','waiter')" >/dev/null
run | head -2
echo
echo "===== PRE-FLIGHT 4: duplicate table names ====="
/tmp/h/rebuild.sh >/dev/null 2>&1
psqlc "insert into restaurant_tables(branch_id,label) values ('aaaaaaaa-0000-0000-0000-00000000000a',' table 1')" >/dev/null
run | head -2
