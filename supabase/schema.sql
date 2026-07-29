-- Tavern POS schema
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- NOTE: products/sales/staff already existed in this project before this
-- file did, with a shape that differs slightly from a clean install (no
-- business_id, staff.hashed_pin instead of pin_hash, sales has no
-- quantity). "create table if not exists" is a no-op against an existing
-- table — it does NOT add missing columns — so those are added below via
-- explicit "alter table ... add column if not exists" instead, which is
-- safe to run against both a fresh install and this existing database.

create table if not exists products (
  id bigint generated always as identity primary key,
  name text not null,
  category text not null default 'other',
  price numeric not null default 0,
  cost_price numeric not null default 0,
  stock integer not null default 0,
  opening_stock integer not null default 0,
  barcode text unique,
  created_at timestamptz not null default now()
);
alter table products add column if not exists business_id uuid;

create table if not exists sales (
  id bigint generated always as identity primary key,
  product_id bigint references products(id) on delete set null,
  total numeric not null,
  payment_method text not null check (payment_method in ('cash', 'card')),
  staff_name text not null,
  created_at timestamptz not null default now()
);
alter table sales add column if not exists business_id uuid;
alter table sales add column if not exists quantity integer not null default 1;

create table if not exists staff (
  id bigint generated always as identity primary key,
  name text not null,
  role text not null,
  hashed_pin text not null,
  created_at timestamptz not null default now()
);
alter table staff add column if not exists business_id uuid;

-- Helper to hash a PIN when creating staff, e.g.:
-- insert into staff (name, role, hashed_pin) values ('Thabo', 'staff', crypt('1234', gen_salt('bf')));

create or replace function verify_staff_pin(input_pin text, input_business_id uuid default null)
returns table (name text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.name, s.role
  from staff s
  where s.hashed_pin = extensions.crypt(input_pin, s.hashed_pin)
    and (input_business_id is null or s.business_id = input_business_id)
  limit 1;
end;
$$;

-- Only the server (service-role key) may call this — it's how the login
-- route checks a PIN. Block anon/authenticated so the check can't be
-- brute-forced directly against Supabase's REST API, bypassing our
-- app-level rate limit.
revoke all on function verify_staff_pin(text, uuid) from public;
revoke all on function verify_staff_pin(text, uuid) from anon;
revoke all on function verify_staff_pin(text, uuid) from authenticated;
grant execute on function verify_staff_pin(text, uuid) to service_role;

-- Lets the staff-management API hash a new/reset PIN without needing raw
-- SQL access. Locked down the same way as verify_staff_pin.
create or replace function hash_staff_pin(input_pin text)
returns text
language sql
security definer
set search_path = public
as $$
  select extensions.crypt(input_pin, extensions.gen_salt('bf'));
$$;

revoke all on function hash_staff_pin(text) from public;
revoke all on function hash_staff_pin(text) from anon;
revoke all on function hash_staff_pin(text) from authenticated;
grant execute on function hash_staff_pin(text) to service_role;

create table if not exists staff_sessions (
  id bigint generated always as identity primary key,
  staff_name text not null,
  login_at timestamptz not null default now(),
  logout_at timestamptz
);

create table if not exists undo_audit_log (
  id bigint generated always as identity primary key,
  sale_id uuid,
  product_id uuid,
  quantity integer,
  total numeric,
  staff_name text,
  undone_by text,
  approved_by text,
  created_at timestamptz not null default now()
);

create table if not exists cash_counts (
  id bigint generated always as identity primary key,
  staff_name text not null,
  counted_amount numeric not null,
  expected_cash numeric not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'discrepancy')),
  owner_name text,
  owner_amount numeric,
  owner_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Row Level Security: lock down direct table access entirely. All reads
-- and writes go through Next.js API routes using the service-role key
-- (which bypasses RLS), never the anon key from the browser. No policies
-- are defined for anon/authenticated, so RLS denies them by default —
-- this is what actually enforces per-business data isolation, since
-- business scoping is only applied at the application layer.
alter table products enable row level security;
alter table sales enable row level security;
alter table staff enable row level security;
alter table undo_audit_log enable row level security;
alter table cash_counts enable row level security;
alter table staff_sessions enable row level security;
