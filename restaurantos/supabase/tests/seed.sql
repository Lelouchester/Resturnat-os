set session_replication_role = replica;
-- Two unrelated cafes, several roles, and a bit of money data.
insert into branches(id,name,code,notes,phone) values
 ('aaaaaaaa-0000-0000-0000-00000000000a','Cafe A','cafea','PRIVATE: safe code 4471','9800000001'),
 ('bbbbbbbb-0000-0000-0000-00000000000b','Cafe B','cafeb','B notes','9800000002');
insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-1111-1111-111111111111','admina@x.com',now()),
 ('22222222-2222-2222-2222-222222222222','mgra@x.com',now()),
 ('33333333-3333-3333-3333-333333333333','mgr2a@x.com',now()),
 ('44444444-4444-4444-4444-444444444444','waitera@x.com',now()),
 ('55555555-5555-5555-5555-555555555555','cashiera@x.com',now()),
 ('66666666-6666-6666-6666-666666666666','fireda@x.com',now()),
 ('77777777-7777-7777-7777-777777777777','adminb@x.com',now()),
 ('88888888-8888-8888-8888-888888888888','storea@x.com',now()),
 ('99999999-9999-9999-9999-999999999999','newhire@example.com',null);   -- signed up but NEVER verified the email
insert into staff(id,branch_id,auth_user_id,email,name,role,is_active) values
 ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','admina@x.com','Admin A','admin',true),
 ('a2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222','mgra@x.com','Manager A','manager',true),
 ('a3000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a','33333333-3333-3333-3333-333333333333','mgr2a@x.com','Manager A2','manager',true),
 ('a4000000-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-00000000000a','44444444-4444-4444-4444-444444444444','waitera@x.com','Waiter A','waiter',true),
 ('a5000000-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-00000000000a','55555555-5555-5555-5555-555555555555','cashiera@x.com','Cashier A','cashier',true),
 ('a6000000-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666','fireda@x.com','Fired A','waiter',false),
 ('b7000000-0000-0000-0000-000000000007','bbbbbbbb-0000-0000-0000-00000000000b','77777777-7777-7777-7777-777777777777','adminb@x.com','Admin B','admin',true),
 ('a8000000-0000-0000-0000-000000000008','aaaaaaaa-0000-0000-0000-00000000000a','88888888-8888-8888-8888-888888888888','storea@x.com','Store A','store',true),
 ('a9000000-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-00000000000a',null,'newhire@example.com','New Hire','waiter',true);
insert into payment_methods(id,branch_id,key,label) values
 ('c1000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','cash','Cash'),
 ('c2000000-0000-0000-0000-00000000000a','bbbbbbbb-0000-0000-0000-00000000000b','cash','Cash');
insert into accounts(id,branch_id,payment_method_id,balance) values
 ('d1000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','c1000000-0000-0000-0000-00000000000a',1000),
 ('d2000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-00000000000b','c2000000-0000-0000-0000-00000000000a',500);
insert into restaurant_tables(id,branch_id,label) values
 ('e1000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','Table 1'),
 ('e2000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','Table 2');
-- a paid order closed "now" (today) with a real payment, and one paid "yesterday"
insert into orders(id,branch_id,table_id,status,total,closed_at) values
 ('f1000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','paid',300,now()),
 ('f2000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-00000000000a','paid',200,now()-interval '30 hours');
insert into payments(order_id,payment_method_id,amount) values
 ('f1000000-0000-0000-0000-00000000000a','c1000000-0000-0000-0000-00000000000a',300),
 ('f2000000-0000-0000-0000-00000000000a','c1000000-0000-0000-0000-00000000000a',200);
insert into inventory_items(id,branch_id,name,current_stock) values ('a1a10000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','Beer',2);
insert into purchases(id,branch_id,status) values ('9a000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','ordered');
