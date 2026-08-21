-- Run in Supabase SQL Editor after schema.sql, pricing-settings.sql, and admin-policies.sql

-- Customer-uploaded STL files (private bucket)
insert into storage.buckets (id, name, public)
values ('customer-uploads', 'customer-uploads', false)
on conflict (id) do nothing;

drop policy if exists "Public upload customer STL" on storage.objects;
create policy "Public upload customer STL"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'customer-uploads');

-- Product reviews (moderated on admin)
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  author_name text not null,
  author_email text,
  rating smallint not null check (rating between 1 and 5),
  comment text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists product_reviews_slug_status_idx
  on public.product_reviews (product_slug, status);

alter table public.product_reviews enable row level security;

grant select, insert on public.product_reviews to anon, authenticated;
grant update, delete on public.product_reviews to anon, authenticated;

drop policy if exists "Public read approved reviews" on public.product_reviews;
create policy "Public read approved reviews"
  on public.product_reviews
  for select
  to anon, authenticated
  using (status = 'approved');

drop policy if exists "Public read pending reviews" on public.product_reviews;
create policy "Public read pending reviews"
  on public.product_reviews
  for select
  to anon, authenticated
  using (status = 'pending');

drop policy if exists "Public insert reviews" on public.product_reviews;
create policy "Public insert reviews"
  on public.product_reviews
  for insert
  to anon, authenticated
  with check (status = 'pending');

drop policy if exists "Public update reviews" on public.product_reviews;
create policy "Public update reviews"
  on public.product_reviews
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Public delete reviews" on public.product_reviews;
create policy "Public delete reviews"
  on public.product_reviews
  for delete
  to anon, authenticated
  using (true);

-- Contact requests (3D model design inquiries)
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  message text not null,
  request_type text not null default 'model_design' check (request_type in ('model_design', 'general')),
  status text not null default 'new' check (status in ('new', 'read', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.contact_requests enable row level security;

grant insert, select, update on public.contact_requests to anon, authenticated;

drop policy if exists "Public insert contact_requests" on public.contact_requests;
create policy "Public insert contact_requests"
  on public.contact_requests
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Public read contact_requests" on public.contact_requests;
create policy "Public read contact_requests"
  on public.contact_requests
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public update contact_requests" on public.contact_requests;
create policy "Public update contact_requests"
  on public.contact_requests
  for update
  to anon, authenticated
  using (true)
  with check (true);
