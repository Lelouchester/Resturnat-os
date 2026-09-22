# usage: as <uuid> [email] "<sql>"   -> prints result rows or ERR:<message>
as() {
  local uid="$1" email="$2" sql="$3"
  su postgres -c "psql -d rt -tA -v ON_ERROR_STOP=1 -c \"set role authenticated; select set_config('request.jwt.claim.sub','$uid',false); select set_config('request.jwt.claims','{\\\"sub\\\":\\\"$uid\\\",\\\"email\\\":\\\"$email\\\"}',false); $sql\"" 2>&1 \
    | grep -v "^set_config\|^SET\|^$\|^[0-9a-f-]\{36\}$\|^{" | sed 's/^psql:.*ERROR: */ERR: /; s/^ERROR: */ERR: /' | head -${LINES_MAX:-3}
}
su_() { su postgres -c "psql -d rt -tA -c \"$1\""; }
ADMIN_A=11111111-1111-1111-1111-111111111111; MGR_A=22222222-2222-2222-2222-222222222222; MGR2_A=33333333-3333-3333-3333-333333333333
WAITER_A=44444444-4444-4444-4444-444444444444; CASHIER_A=55555555-5555-5555-5555-555555555555; FIRED_A=66666666-6666-6666-6666-666666666666
ADMIN_B=77777777-7777-7777-7777-777777777777; STORE_A=88888888-8888-8888-8888-888888888888; NEWHIRE=99999999-9999-9999-9999-999999999999
TODAY_ORDER=f1000000-0000-0000-0000-00000000000a; OLD_ORDER=f2000000-0000-0000-0000-00000000000a
