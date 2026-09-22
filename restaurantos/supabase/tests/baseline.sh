#!/bin/bash
source /tmp/h/lib.sh
NEPAL_TODAY="(date_trunc('day', now() at time zone 'Asia/Kathmandu') at time zone 'Asia/Kathmandu')"
echo "B1 fired (deactivated) waiter reads orders     -> rows visible: $(as $FIRED_A f@x 'select count(*) from orders;')   (should be 0)"
echo "B2 anonymous visitor reads branch private notes -> $(su postgres -c "psql -d rt -tA -c \"set role anon; select notes from branches where code='cafea';\"" | grep -v '^SET')   (should be nothing)"
echo "B3 manager promotes SELF to admin               -> $(as $MGR_A m@x "update staff set role='admin' where id='a2000000-0000-0000-0000-000000000002' returning role;")   (should be blocked)"
su_ "update staff set role='manager' where id='a2000000-0000-0000-0000-000000000002'" >/dev/null
echo "B3b manager edits the OTHER manager's row       -> $(as $MGR_A m@x "update staff set name='hacked' where id='a3000000-0000-0000-0000-000000000003' returning name;")   (should be blocked by hierarchy)"
su_ "update staff set name='Manager A2' where id='a3000000-0000-0000-0000-000000000003'" >/dev/null
echo "B4 plain waiter cancels a paid order            -> $(as $WAITER_A w@x "select cancel_order('$TODAY_ORDER', $NEPAL_TODAY);" 2>&1 | head -1)   (should be blocked)"
su_ "update orders set status='paid' where id='$TODAY_ORDER'; update accounts set balance=1000 where id='d1000000-0000-0000-0000-00000000000a'" >/dev/null
echo "B5 cancel yesterday's order via fake 'today'    -> $(as $MGR_A m@x "select cancel_order('$OLD_ORDER', '2000-01-01');" 2>&1 | head -1)   (should be blocked)"
su_ "update orders set status='paid' where id='$OLD_ORDER'; update accounts set balance=1000 where id='d1000000-0000-0000-0000-00000000000a'" >/dev/null
echo "B6 waiter rewrites a payment amount             -> $(as $WAITER_A w@x "update payments set amount=1 where order_id='$TODAY_ORDER' returning amount;")   (should be blocked)"
su_ "update payments set amount=300 where order_id='$TODAY_ORDER'" >/dev/null
as $NEWHIRE newhire@example.com "select link_staff_account('cafea');" >/dev/null
echo "B7 UNVERIFIED email claims a staff record       -> linked: $(su_ "select auth_user_id is not null from staff where id='a9000000-0000-0000-0000-000000000009'")   (should stay f)"
echo "B8 stock 2: sell 5 then void -> stock now:      -> $(su_ "select increment_stock('a1a10000-0000-0000-0000-00000000000a', -5, 'sale_deduction'); select increment_stock('a1a10000-0000-0000-0000-00000000000a', 5, 'adjustment');" | tail -1)   (should be back to 2)"
