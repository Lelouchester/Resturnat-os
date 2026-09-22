#!/bin/bash
# Rebuild the scratch database from the real schema + migrations up to 019, then seed.
set -e
REPO_SQL=${REPO_SQL:-/home/claude/restaurantos/supabase}
sed "s/^create extension if not exists pg_cron;//" $REPO_SQL/schema.sql > /tmp/h/schema_test.sql
cd /tmp/h
su postgres -c "psql -q -c 'drop database if exists rt' -c 'create database rt'" 2>&1 | grep -v NOTICE || true
P="su postgres -c"
$P "psql -q -v ON_ERROR_STOP=1 -d rt -f /tmp/h/stubs.sql" >/dev/null
$P "psql -q -v ON_ERROR_STOP=1 -d rt -f /tmp/h/schema_test.sql" 2>&1 | grep -v "NOTICE\|^$" || true
for f in 017 018; do $P "psql -q -v ON_ERROR_STOP=1 -d rt -f $(ls /home/claude/restaurantos/supabase/migrations/${f}_*.sql)" 2>&1 | grep -v "NOTICE\|^$" || true; done
$P "psql -q -d rt -c \"grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated; grant all on all sequences in schema public to anon, authenticated; grant execute on all functions in schema public to anon, authenticated;\"" >/dev/null
$P "psql -q -v ON_ERROR_STOP=1 -d rt -f /tmp/h/seed.sql" 
echo "rebuilt + seeded"
