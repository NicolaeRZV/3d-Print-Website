-- Run this in Supabase Dashboard → SQL → New query
-- Fixes "new row violates row-level security policy for table orders"

grant insert on public.orders to anon, authenticated;

drop policy if exists "Public insert orders" on public.orders;
create policy "Public insert orders"
  on public.orders
  for insert
  to anon, authenticated
  with check (true);
