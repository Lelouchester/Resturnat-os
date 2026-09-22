set session_replication_role = replica;
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-1111-1111-1111-111111111111','sharea@x.com',now()),
 ('aaaaaaaa-2222-2222-2222-222222222222','admin2a@x.com',now());
insert into staff(id,branch_id,auth_user_id,email,name,role,is_active) values
 ('a0000000-0000-0000-0000-00000000a001','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaaa-1111-1111-1111-111111111111','sharea@x.com','Shareholder A','shareholder',true),
 ('a0000000-0000-0000-0000-00000000a002','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaaa-2222-2222-2222-222222222222','admin2a@x.com','Admin A2','admin',true);
-- an open order on Table 2 (for legit payment inserts) and an OLD purchase
insert into orders(id,branch_id,table_id,status,total) values ('f3000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','e2000000-0000-0000-0000-00000000000a','open',150);
insert into purchases(id,branch_id,status,created_at) values ('9b000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','ordered',now()-interval '3 days');
