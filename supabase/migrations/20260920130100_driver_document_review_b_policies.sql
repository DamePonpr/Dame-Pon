-- Dame Pon / OpenRide adoption — Layer B private document policies
--
-- Requires 20260920130000_driver_document_review_b.sql to be applied first.

begin;

insert into storage.buckets (id, name, public)
values ('driver-documents', 'driver-documents', false)
on conflict (id) do update set public = false;

drop policy if exists driver_documents_storage_owner_read on storage.objects;
create policy driver_documents_storage_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists driver_documents_storage_owner_insert on storage.objects;
create policy driver_documents_storage_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists driver_documents_storage_owner_update on storage.objects;
create policy driver_documents_storage_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists driver_documents_storage_owner_delete on storage.objects;
create policy driver_documents_storage_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists driver_documents_owner_update on public.driver_documents;
create policy driver_documents_owner_update on public.driver_documents
  for update to authenticated
  using (driver_id = auth.uid() and status in ('submitted', 'rejected', 'expired'))
  with check (driver_id = auth.uid() and status = 'submitted');

drop policy if exists vehicle_documents_owner_insert on public.vehicle_documents;
create policy vehicle_documents_owner_insert on public.vehicle_documents
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_documents.vehicle_id
        and v.driver_id = auth.uid()
    )
    and status = 'submitted'
  );

drop policy if exists vehicle_documents_owner_update on public.vehicle_documents;
create policy vehicle_documents_owner_update on public.vehicle_documents
  for update to authenticated
  using (
    status in ('submitted', 'rejected', 'expired')
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_documents.vehicle_id
        and v.driver_id = auth.uid()
    )
  )
  with check (
    status = 'submitted'
    and exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_documents.vehicle_id
        and v.driver_id = auth.uid()
    )
  );

commit;