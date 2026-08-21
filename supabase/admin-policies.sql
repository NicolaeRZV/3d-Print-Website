-- Run after schema.sql — enables admin.html to add/delete products and STL files.
-- Note: these policies allow writes with the public anon key. For production, restrict
-- writes to authenticated admin users only.

drop policy if exists "Public insert 3dmodels" on public."3dmodels";
create policy "Public insert 3dmodels"
  on public."3dmodels"
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Public delete 3dmodels" on public."3dmodels";
create policy "Public delete 3dmodels"
  on public."3dmodels"
  for delete
  to anon, authenticated
  using (true);

drop policy if exists "Public update 3dmodels" on public."3dmodels";
create policy "Public update 3dmodels"
  on public."3dmodels"
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Public upload STL files" on storage.objects;
create policy "Public upload STL files"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'stl-files');

drop policy if exists "Public delete STL files" on storage.objects;
create policy "Public delete STL files"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'stl-files');
