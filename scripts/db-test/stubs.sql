-- Minimal stand-ins for the Supabase pieces the migration depends on, so it
-- can be tested on a plain Postgres + PostGIS. Not used in production.
-- Roles are cluster-wide, so they may exist from a previous run.
do $$
begin
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;
grant usage on schema public to anon, authenticated, service_role;

create schema extensions;
grant usage on schema extensions to anon, authenticated;
create extension pgcrypto with schema extensions;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb default '{}',
  raw_user_meta_data jsonb default '{}',
  created_at timestamptz,
  updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets, name text, owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to authenticated;
grant insert on storage.objects to authenticated;

-- pg_net: record requests instead of sending them.
create schema net;
create table net.test_requests (
  id bigserial primary key, url text, body jsonb, headers jsonb, created_at timestamptz default now()
);
create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net.test_requests (url, body, headers) values (url, body, headers) returning id
$$;
