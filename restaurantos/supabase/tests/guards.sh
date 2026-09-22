#!/bin/bash
/tmp/h/up.sh; /tmp/h/rebuild.sh >/dev/null 2>&1
D=${REPO_SQL:-/home/claude/restaurantos/supabase}/dev-only
p() { su postgres -c "psql -q -d rt -v ON_ERROR_STOP=1 -f $1" 2>&1 | grep -o "STOPPED[^.]*\." | head -1; }
echo "1) reset WITHOUT confirmation:        $(p $D/reset.DANGEROUS.sql)"
printf "set app.i_understand_this_deletes_everything = 'yes';\n" > /tmp/h/reset_confirmed.sql; cat $D/reset.DANGEROUS.sql >> /tmp/h/reset_confirmed.sql
chmod 644 /tmp/h/reset_confirmed.sql
echo "2) reset WITH confirmation, but real orders exist: $(p /tmp/h/reset_confirmed.sql)"
echo "3) demo seed on a database that has orders:        $(p $D/seed.DEMO-DATA-ONLY.sql)"
echo "   tables still there after all that? $(su postgres -c "psql -d rt -tAc \"select count(*) from orders\"") orders intact"
# empty database: confirmed reset should be allowed to run
su postgres -c "psql -q -c 'drop database if exists rt2' -c 'create database rt2'" 2>&1 | grep -v NOTICE
su postgres -c "psql -q -d rt2 -f /tmp/h/stubs.sql" >/dev/null 2>&1
su postgres -c "psql -q -d rt2 -f /tmp/h/schema_test.sql" >/dev/null 2>&1
su postgres -c "psql -q -d rt2 -v ON_ERROR_STOP=1 -f /tmp/h/reset_confirmed.sql" >/dev/null 2>&1; echo "4) (the confirmation guard let it start; the OLD script then stops on tables added after migration 003 — that is why it is quarantined) exit $?"
