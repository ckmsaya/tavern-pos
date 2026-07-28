-- Tavern POS schema
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists products (
  id bigint generated always as identity primary key,
  business_id uuid,
  name text not null,
  category text not null default 'other',
  price numeric not null default 0,
  cost_price numeric not null default 0,
  stock integer not null default 0,
  opening_stock integer not null default 0,
  barcode text unique,
  created_at timestamptz not null default now()
);

create table if not exists sales (
  id bigint generated always as identity primary key,
  business_id uuid,
  product_id bigint references products(id) on delete set null,
  quantity integer not null default 1,
  total numeric not null,
  payment_method text not null check (payment_method in ('cash', 'card')),
  staff_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists staff (
  id bigint generated always as identity primary key,
  business_id uuid,
  name text not null,
  role text not null check (role in ('owner', 'staff')),
  pin_hash text not null,
  created_at timestamptz not null default now()
);

-- Helper to hash a PIN when creating staff, e.g.:
-- insert into staff (name, role, pin_hash) values ('Thabo', 'staff', crypt('1234', gen_salt('bf')));

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
  where s.pin_hash = crypt(input_pin, s.pin_hash)
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

-- Row Level Security: lock down direct table access entirely. All reads
-- and writes go through Next.js API routes using the service-role key
-- (which bypasses RLS), never the anon key from the browser. No policies
-- are defined for anon/authenticated, so RLS denies them by default —
-- this is what actually enforces per-business data isolation, since
-- business scoping is only applied at the application layer.
alter table products enable row level security;
alter table sales enable row level security;
alter table staff enable row level security;
