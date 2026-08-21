-- Run in Supabase Dashboard → SQL → New query
-- Enables user STL / 3D model upload requests from the storefront.

create table if not exists public.custom_prints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  customer_address text not null default '',
  stl_path text not null,
  file_name text,
  files jsonb not null default '[]'::jsonb,
  material text,
  color_name text,
  color_hex text,
  size_key text default 'stl',
  notes text,
  estimated_price numeric(10,2),
  print_hours numeric(10,3),
  filament_grams numeric(10,2),
  bambu_source text,
  status text not null default 'new'
);

-- Migration for existing installs
alter table public.custom_prints
  add column if not exists files jsonb not null default '[]'::jsonb;

alter table public.custom_prints
  add column if not exists print_hours numeric(10,3);

alter table public.custom_prints
  add column if not exists filament_grams numeric(10,2);

alter table public.custom_prints
  add column if not exists bambu_source text;

alter table public.custom_prints
  alter column customer_address set default '';

alter table public.custom_prints
  alter column customer_phone set default '';

update public.custom_prints
set customer_address = coalesce(nullif(trim(customer_address), ''), '—')
where customer_address is null or trim(customer_address) = '';

update public.custom_prints
set customer_phone = coalesce(nullif(trim(customer_phone), ''), '—')
where customer_phone is null or trim(customer_phone) = '';

alter table public.custom_prints
  alter column customer_address set not null;

alter table public.custom_prints
  alter column customer_phone set not null;

-- Backfill files array from legacy single-file columns
update public.custom_prints
set files = jsonb_build_array(jsonb_build_object(
  'path', stl_path,
  'name', coalesce(nullif(file_name, ''), stl_path),
  'size', null
))
where (files is null or files = '[]'::jsonb)
  and stl_path is not null
  and stl_path <> '';

alter table public.custom_prints enable row level security;

grant insert, select, update on public.custom_prints to anon, authenticated;

drop policy if exists "Public insert custom_prints" on public.custom_prints;
create policy "Public insert custom_prints"
  on public.custom_prints
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Public read custom_prints" on public.custom_prints;
create policy "Public read custom_prints"
  on public.custom_prints
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public update custom_prints" on public.custom_prints;
create policy "Public update custom_prints"
  on public.custom_prints
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- Needed for realtime popup in admin.html (safe if already added)
do $$
begin
  alter publication supabase_realtime add table public.custom_prints;
exception
  when duplicate_object then null;
  when others then null;
end $$;

insert into storage.buckets (id, name, public)
values ('stl-files', 'stl-files', true)
on conflict (id) do update set public = true;
