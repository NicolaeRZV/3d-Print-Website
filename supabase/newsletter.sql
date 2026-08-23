-- Newsletter email list for the storefront form.
-- Supabase Dashboard → SQL → New query → Run

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  source text not null default 'storefront',
  user_agent text
);

create unique index if not exists newsletter_subscribers_email_lower_idx
  on public.newsletter_subscribers (lower(email));

alter table public.newsletter_subscribers enable row level security;

grant insert, select, delete on public.newsletter_subscribers to anon, authenticated;

drop policy if exists "Public insert newsletter_subscribers" on public.newsletter_subscribers;
create policy "Public insert newsletter_subscribers"
  on public.newsletter_subscribers
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Public read newsletter_subscribers" on public.newsletter_subscribers;
create policy "Public read newsletter_subscribers"
  on public.newsletter_subscribers
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public delete newsletter_subscribers" on public.newsletter_subscribers;
create policy "Public delete newsletter_subscribers"
  on public.newsletter_subscribers
  for delete
  to anon, authenticated
  using (true);
