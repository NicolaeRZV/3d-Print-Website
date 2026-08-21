-- Run in Supabase Dashboard → SQL → New query
-- Enables user STL / 3D model upload requests from the storefront.

create table if not exists public.custom_prints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  customer_address text,
  stl_path text not null,
  file_name text,
  material text,
  color_name text,
  color_hex text,
  size_key text,
  notes text,
  estimated_price numeric(10,2),
  status text not null default 'new'
);

alter table public.custom_prints enable row level security;

grant insert on public.custom_prints to anon, authenticated;
grant select on public.custom_prints to authenticated;

drop policy if exists "Public insert custom_prints" on public.custom_prints;
create policy "Public insert custom_prints"
  on public.custom_prints
  for insert
  to anon, authenticated
  with check (true);

-- Storefront account + admin.html (anon key) can list requests
drop policy if exists "Public read custom_prints" on public.custom_prints;
create policy "Public read custom_prints"
  on public.custom_prints
  for select
  to anon, authenticated
  using (true);

-- Custom uploads live under stl-files/custom/ (admin policies already allow insert/select)
-- Ensure bucket exists and is public for read (needed if you preview uploaded files later)
insert into storage.buckets (id, name, public)
values ('stl-files', 'stl-files', true)
on conflict (id) do update set public = true;
