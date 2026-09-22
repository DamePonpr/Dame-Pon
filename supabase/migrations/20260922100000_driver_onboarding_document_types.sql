-- Dame Pon preview-30 — onboarding fields and document types
--
-- Apply this migration manually in the configured Supabase project before
-- testing the onboarding gate. It is intentionally separate from the
-- agreement/activation migration because enum additions must commit before
-- they can be used by later statements.

begin;

alter type public.driver_document_type add value if not exists 'ntsp_certificate_1';
alter type public.driver_document_type add value if not exists 'ntsp_certificate_2';
alter type public.driver_document_type add value if not exists 'conduct_certificate_1';
alter type public.driver_document_type add value if not exists 'conduct_certificate_2';

alter type public.vehicle_document_type add value if not exists 'vehicle_front';
alter type public.vehicle_document_type add value if not exists 'vehicle_rear';
alter type public.vehicle_document_type add value if not exists 'vehicle_left';
alter type public.vehicle_document_type add value if not exists 'vehicle_right';
alter type public.vehicle_document_type add value if not exists 'vehicle_interior';
alter type public.vehicle_document_type add value if not exists 'vin';
alter type public.vehicle_document_type add value if not exists 'door_label';

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists default_payment_method text not null default 'cash';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_default_payment_method'
  ) then
    alter table public.profiles
      add constraint profiles_default_payment_method
      check (default_payment_method in ('cash', 'card'));
  end if;
end $$;

alter table public.drivers
  add column if not exists onboarding_step integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.drivers'::regclass
      and conname = 'drivers_onboarding_step'
  ) then
    alter table public.drivers
      add constraint drivers_onboarding_step
      check (onboarding_step between 0 and 6);
  end if;
end $$;

alter table public.vehicles
  add column if not exists vin text;

insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update set public = true;

drop policy if exists profile_media_owner_insert on storage.objects;
create policy profile_media_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists profile_media_owner_update on storage.objects;
create policy profile_media_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;