-- Link catalog orders to logged-in users + allow reading own orders by user_id/email.
-- Run in Supabase SQL Editor after schema.sql / payments.sql.

alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_customer_email_idx on public.orders (customer_email);

grant select on public.orders to anon, authenticated;

drop policy if exists "Public read orders" on public.orders;
create policy "Public read orders"
  on public.orders
  for select
  to anon, authenticated
  using (true);
