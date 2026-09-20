-- Dame Pon / OpenRide adoption — Layer B driver document states
--
-- REVIEW ONLY. Do not apply this migration automatically.
-- Prerequisite: the review-only A1 migration must have been reconciled with
-- the remote schema first.
--
-- Enum values are intentionally kept in their own migration. PostgreSQL does
-- not allow a newly added enum value to be used safely until its transaction
-- has committed. The Storage and RLS policies are in the next migration.

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