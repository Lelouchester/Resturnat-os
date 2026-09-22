# tiny assertion helpers
PASS=0; FAILN=0
ok()   { if [[ "$2" == ERR* ]]; then echo "FAIL  $1  -> expected success, got: $2"; FAILN=$((FAILN+1)); else echo "PASS  $1"; PASS=$((PASS+1)); fi; }
deny() { if [[ "$2" == ERR* || "$2" == "0" || -z "$2" ]]; then echo "PASS  $1   [${2:-blocked}]"; PASS=$((PASS+1)); else echo "FAIL  $1  -> was ALLOWED: $2"; FAILN=$((FAILN+1)); fi; }
eq()   { if [[ "$2" == "$3" ]]; then echo "PASS  $1  ($2)"; PASS=$((PASS+1)); else echo "FAIL  $1  -> expected '$3' got '$2'"; FAILN=$((FAILN+1)); fi; }
summary() { echo "----- $PASS passed, $FAILN failed"; }
cnt() { echo "with u as ($1 returning 1) select count(*) from u;"; }   # rows affected by an UPDATE/DELETE
