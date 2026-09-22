-- Stand-ins for the Supabase-provided pieces schema.sql depends on.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text,
  raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}',
  email_confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
-- pg_cron stand-in
create schema if not exists cron;
create table if not exists cron.job (jobid serial, jobname text);
create or replace function cron.schedule(n text, s text, c text) returns bigint language sql as $$ select 1::bigint $$;
create or replace function cron.unschedule(n text) returns boolean language sql as $$ select true $$;
-- Supabase grants these by default (RLS policies call auth.uid() as the calling role).
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
