-- Run in Supabase SQL Editor after schema.sql
-- Stores the storefront/admin pricing formula (single row).

create table if not exists public.pricing_settings (
  id int primary key default 1 check (id = 1),
  rate_per_hour numeric(10,2) not null default 8,
  rate_per_gram_pla numeric(10,4) not null default 0.12,
  rate_per_gram_petg numeric(10,4) not null default 0.15,
  rate_per_gram_tpu numeric(10,4) not null default 0.22,
  rate_per_gram_abs numeric(10,4) not null default 0.18,
  drying_fee numeric(10,2) not null default 12,
  base_fee numeric(10,2) not null default 15,
  markup_percent numeric(5,2) not null default 25,
  min_price numeric(10,2) not null default 19.99,
  round_up_to numeric(10,2) not null default 0.99,
  updated_at timestamptz not null default now()
);

insert into public.pricing_settings (id) values (1)
on conflict (id) do nothing;

alter table public.pricing_settings enable row level security;

grant select on public.pricing_settings to anon, authenticated;
grant insert, update on public.pricing_settings to anon, authenticated;

drop policy if exists "Public read pricing_settings" on public.pricing_settings;
create policy "Public read pricing_settings"
  on public.pricing_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public upsert pricing_settings" on public.pricing_settings;
create policy "Public upsert pricing_settings"
  on public.pricing_settings
  for insert
  to anon, authenticated
  with check (id = 1);

drop policy if exists "Public update pricing_settings" on public.pricing_settings;
create policy "Public update pricing_settings"
  on public.pricing_settings
  for update
  to anon, authenticated
  using (id = 1)
  with check (id = 1);
