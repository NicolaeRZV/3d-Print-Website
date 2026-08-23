-- Checkout shipping methods: home delivery vs Sameday Easybox.
-- Run in Supabase Dashboard → SQL → New query

alter table public.pricing_settings
  add column if not exists shipping_easybox numeric(10,2) not null default 15;

update public.pricing_settings
set shipping_easybox = coalesce(shipping_easybox, 15)
where id = 1;

alter table public.orders
  add column if not exists shipping_method text not null default 'home',
  add column if not exists locker_id text,
  add column if not exists locker_name text,
  add column if not exists locker_address text,
  add column if not exists locker_city text,
  add column if not exists locker_county text;

alter table public.custom_prints
  add column if not exists shipping_method text not null default 'home',
  add column if not exists locker_id text,
  add column if not exists locker_name text,
  add column if not exists locker_address text,
  add column if not exists locker_city text,
  add column if not exists locker_county text;

comment on column public.orders.shipping_method is 'home | easybox';
comment on column public.custom_prints.shipping_method is 'home | easybox';

grant update on public.orders to anon, authenticated;

drop policy if exists "Public update orders checkout" on public.orders;
create policy "Public update orders checkout"
  on public.orders
  for update
  to anon, authenticated
  using (true)
  with check (true);
