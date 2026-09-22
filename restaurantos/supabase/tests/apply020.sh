#!/bin/bash
/tmp/h/up.sh
/tmp/h/rebuild.sh 2>&1 | tail -1
su postgres -c "psql -1 -q -v ON_ERROR_STOP=1 -d rt -f ${REPO_SQL:-/home/claude/restaurantos/supabase}/migrations/020_roles_security_hardening.sql" 2>&1 | grep -v "^NOTICE\|^$"
echo "020 exit: ${PIPESTATUS[0]}"
