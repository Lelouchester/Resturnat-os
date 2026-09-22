#!/bin/bash
/tmp/h/up.sh; /tmp/h/rebuild.sh >/dev/null 2>&1
MIG=${REPO_SQL:-/home/claude/restaurantos/supabase}/migrations/020_roles_security_hardening.sql
for i in 1 2 3; do
  su postgres -c "psql -1 -q -v ON_ERROR_STOP=1 -d rt -f $MIG" >/dev/null 2>&1
  echo "run $i: psql exit code = $?"
done
echo "policies on staff after 3 runs (should be exactly 4): $(su postgres -c "psql -d rt -tAc \"select count(*) from pg_policies where tablename='staff'\"")"
echo "guard triggers on staff (should be 1): $(su postgres -c "psql -d rt -tAc \"select count(*) from pg_trigger where tgrelid='staff'::regclass and tgname='trg_staff_guard'\"")"
