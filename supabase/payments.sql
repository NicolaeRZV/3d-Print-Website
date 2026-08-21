-- Run in Supabase SQL Editor.
-- Payment + shipping fields for catalog orders and custom prints.

-- Pricing knobs (covers typical Fan/Cargus home delivery + COD fee; free ship only when margin can absorb it)
alter table public.pricing_settings
  add column if not exists shipping_flat numeric(10,2) not null default 25,
  add column if not exists free_shipping_over numeric(10,2) not null default 250,
  add column if not exists cod_fee numeric(10,2) not null default 8;

update public.pricing_settings
set
  shipping_flat = coalesce(shipping_flat, 25),
  free_shipping_over = coalesce(free_shipping_over, 250),
  cod_fee = coalesce(cod_fee, 8)
where id = 1;

-- Catalog orders
alter table public.orders
  add column if not exists payment_method text not null default 'card',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists shipping_fee numeric(10,2) not null default 0,
  add column if not exists cod_fee numeric(10,2) not null default 0,
  add column if not exists total numeric(10,2),
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text;

comment on column public.orders.payment_method is 'card | ramburs';
comment on column public.orders.payment_status is 'pending | paid | unpaid_cod | failed | cancelled';

update public.orders
set total = coalesce(total, subtotal)
where total is null;

-- Custom prints
alter table public.custom_prints
  add column if not exists payment_method text not null default 'card',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists shipping_fee numeric(10,2) not null default 0,
  add column if not exists cod_fee numeric(10,2) not null default 0,
  add column if not exists total numeric(10,2),
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text;

update public.custom_prints
set total = coalesce(total, estimated_price)
where total is null;

-- Allow anon to read own order by id is already open select on custom_prints;
-- Orders: allow select so success page / edge function client can confirm (tighten later)
grant select on public.orders to anon, authenticated;

drop policy if exists "Public read orders" on public.orders;
create policy "Public read orders"
  on public.orders
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public update orders payment" on public.orders;
-- Updates should be service role / webhook only — do not open public update on orders.
