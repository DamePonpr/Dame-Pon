-- Dame Pon / OpenRide adoption — Layer B driver document review
--
-- REVIEW ONLY. Do not apply this migration automatically.
-- Prerequisite: the review-only A1 migration must have been reconciled with
-- the remote schema first.
--
-- This migration only adds the document states/storage boundary needed by
-- the conductor app. Admin approval UI and admin write policies remain out
-- of scope; existing A1 admin policies stay authoritative.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'document_status'
  ) then
    raise exception 'B migration requires public.document_status from A1';
  end if;
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'vehicle_document_type'
  ) then
    raise exception 'B migration requires public.vehicle_document_type from A1';
  end if;
end $$;

alter type public.document_status add value if not exists 'submitted';
alter type public.vehicle_document_type add value if not exists 'photo';

alter table public.drivers
  add column if not exists review_notes text;

-- A driver can only be made available after the complete packet has been
-- approved. The app also disables the control, but this trigger is the
-- database-side guard against stale clients or direct API writes.
create or replace function public.openride_require_approved_driver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_online = true and new.approval_status <> 'approved'::public.driver_approval_status then
    raise exception 'Driver approval is required before going online'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_openride_require_approved_driver on public.drivers;
create trigger trg_openride_require_approved_driver
  before insert or update of is_online, approval_status on public.drivers
  for each row execute function public.openride_require_approved_driver();

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