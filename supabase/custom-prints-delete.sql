-- One-time fix: allow admin.html to delete custom print orders.
-- Supabase Dashboard → SQL → New query → Run

grant delete on public.custom_prints to anon, authenticated;

drop policy if exists "Public delete custom_prints" on public.custom_prints;
create policy "Public delete custom_prints"
  on public.custom_prints
  for delete
  to anon, authenticated
  using (true);
