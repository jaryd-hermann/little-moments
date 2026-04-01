-- entry-media bucket + RLS policies (upload paths: {user_id}/{entry_id}/{filename})
-- Without these, authenticated uploads to storage.objects are denied by default.

insert into storage.buckets (id, name, public, file_size_limit)
values ('entry-media', 'entry-media', true, 52428800)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Clean re-apply (idempotent local runs)
drop policy if exists "entry_media_select_public" on storage.objects;
drop policy if exists "entry_media_insert_authenticated_own" on storage.objects;
drop policy if exists "entry_media_update_authenticated_own" on storage.objects;
drop policy if exists "entry_media_delete_authenticated_own" on storage.objects;

-- Public read so <Image uri={publicUrl} /> works without attaching JWT to image requests
create policy "entry_media_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'entry-media');

create policy "entry_media_insert_authenticated_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'entry-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "entry_media_update_authenticated_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'entry-media'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'entry-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "entry_media_delete_authenticated_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'entry-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );
