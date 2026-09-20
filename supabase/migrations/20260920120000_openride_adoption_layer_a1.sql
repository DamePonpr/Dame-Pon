-- Dame Pon / OpenRide adoption — Layer A1
--
-- Apply only after reconciling the remote schema and validating the backup.
--
-- Goals:
--   * Preserve every existing trip, rating, municipality, driver and vehicle row.
--   * Keep the legacy trip status in trips.status_legacy before replacing the
--     operational enum with the OpenRide lifecycle.
--   * Add the dispatch, driver approval, documents, incident, support, fare and
--     payment model needed by the next layers.
--   * Keep municipio_base, municipio_activo, municipios_activos,
--     municipio_origen, municipio_destino and allow_cross_municipio intact.
--
-- The Edge Functions and realtime channels are deliberately not included here.
-- They belong to A2/A3 and must be reviewed and tested after this migration.

begin;

create extension if not exists "pgcrypto";

-- ============================================================================
-- New OpenRide enum types
-- ============================================================================

do $$
begin
  create type public.driver_status_kind as enum ('offline', 'online', 'on_trip', 'break');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.driver_approval_status as enum (
    'pending_documents', 'pending_review', 'approved', 'suspended', 'offboarded'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_status as enum ('pending', 'approved', 'rejected', 'expired');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.driver_document_type as enum (
    'license_front', 'license_back', 'authority', 'photo', 'medical_cert', 'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.vehicle_document_type as enum (
    'registration', 'insurance', 'authority', 'inspection', 'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.vehicle_type as enum (
    'sedan', 'suv', 'van', 'wagon', 'wheelchair_accessible'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.vehicle_status as enum ('pending', 'active', 'out_of_service', 'retired');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.offer_status as enum ('pending', 'accepted', 'declined', 'timed_out', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.trip_payment_status as enum (
    'pending', 'authorised', 'paid', 'failed', 'refunded', 'waived'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_status as enum (
    'requires_action', 'authorised', 'captured', 'failed',
    'refunded', 'partially_refunded'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.incident_category as enum (
    'safety', 'vehicle_damage', 'abuse', 'payment_dispute', 'medical', 'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.incident_severity as enum ('info', 'low', 'medium', 'high', 'critical');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.incident_status as enum (
    'open', 'triaged', 'under_review', 'resolved', 'closed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.support_case_status as enum (
    'open', 'pending_customer', 'resolved', 'closed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.support_case_priority as enum ('low', 'normal', 'high', 'urgent');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- Trip status adoption, without deleting the old values
-- ============================================================================

-- These policies compare trips.status with the old enum and must be rebuilt
-- after the column changes type.
drop policy if exists "approved_online_drivers_can_view_all_open_trips" on public.trips;
drop policy if exists "authenticated_participants_read_shared_trips" on public.trips;
drop policy if exists "authenticated_passengers_insert_initial_trips" on public.trips;

alter table public.trips
  add column if not exists status_legacy text,
  add column if not exists arrived_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancel_reason text,
  add column if not exists passenger_pin text,
  add column if not exists payment_status public.trip_payment_status;

update public.trips
set status_legacy = status::text
where status_legacy is null;

update public.trips
set payment_status = 'pending'::public.trip_payment_status
where payment_status is null;

-- The existing enum is renamed, not dropped, so old enum labels and their
-- historical meaning remain recoverable. The old column values are already
-- copied to status_legacy above.
alter table public.trips alter column status drop default;
do $$
begin
  if exists (
    select 1
    from pg_type
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where pg_namespace.nspname = 'public'
      and pg_type.typname = 'trip_status'
  ) and not exists (
    select 1
    from pg_type
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where pg_namespace.nspname = 'public'
      and pg_type.typname = 'trip_status_legacy_20260920'
  ) then
    alter type public.trip_status rename to trip_status_legacy_20260920;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where pg_namespace.nspname = 'public'
      and pg_type.typname = 'trip_status'
  ) then
    create type public.trip_status as enum (
      'requested',
      'offered',
      'accepted',
      'arrived',
      'in_progress',
      'completed',
      'cancelled'
    );
  end if;
end $$;

alter table public.trips
  alter column status type public.trip_status
  using (
    case status_legacy
      when 'buscando_conductor' then 'requested'::public.trip_status
      when 'pending' then 'requested'::public.trip_status
      when 'requested' then 'requested'::public.trip_status
      when 'aceptado' then 'accepted'::public.trip_status
      when 'accepted' then 'accepted'::public.trip_status
      when 'en_camino' then 'accepted'::public.trip_status
      when 'offered' then 'offered'::public.trip_status
      when 'arrived' then 'arrived'::public.trip_status
      when 'en_curso' then 'in_progress'::public.trip_status
      when 'ongoing' then 'in_progress'::public.trip_status
      when 'in_progress' then 'in_progress'::public.trip_status
      when 'completado' then 'completed'::public.trip_status
      when 'completed' then 'completed'::public.trip_status
      when 'cancelado' then 'cancelled'::public.trip_status
      when 'cancelled' then 'cancelled'::public.trip_status
      else 'requested'::public.trip_status
    end
  );

alter table public.trips
  alter column status set default 'requested'::public.trip_status,
  alter column payment_status set default 'pending'::public.trip_payment_status;

do $$
begin
  if exists (
    select 1
    from public.trips
    where passenger_pin is not null
      and passenger_pin !~ '^[0-9]{4}$'
  ) then
    raise exception 'A1 preflight failed: trips.passenger_pin contains a value that is not exactly four digits';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.trips'::regclass
      and conname = 'trips_passenger_pin_format'
  ) then
    alter table public.trips
      add constraint trips_passenger_pin_format
      check (passenger_pin is null or passenger_pin ~ '^[0-9]{4}$');
  end if;
end $$;

create index if not exists trips_openride_status_requested_idx
  on public.trips(status, requested_at desc);

create index if not exists trips_openride_driver_status_idx
  on public.trips(driver_id, status);

-- The legacy app could leave several accepted trips assigned to one driver.
-- Keep the most recently requested/accepted trip and close the older rows
-- without changing status_legacy.
with ranked_active_trips as (
  select
    id,
    row_number() over (
      partition by driver_id
      order by coalesce(accepted_at, requested_at) desc nulls last, id desc
    ) as trip_rank
  from public.trips
  where driver_id is not null
    and status in ('accepted', 'arrived', 'in_progress')
)
update public.trips
set status = 'cancelled'::public.trip_status,
    cancelled_at = clock_timestamp(),
    cancelled_by = 'migration_cleanup'
where id in (
  select id
  from ranked_active_trips
  where trip_rank > 1
);

do $$
begin
  if exists (
    select 1
    from public.trips
    where driver_id is not null
      and status in ('accepted', 'arrived', 'in_progress')
    group by driver_id
    having count(*) > 1
  ) then
    raise exception 'A1 preflight failed: more than one active trip remains for a driver; trips_one_openride_active_per_driver cannot be created';
  end if;
end $$;

create unique index if not exists trips_one_openride_active_per_driver
  on public.trips(driver_id)
  where driver_id is not null
    and status in ('accepted', 'arrived', 'in_progress');

-- ============================================================================
-- Driver approval, operational state and vehicle adoption
-- ============================================================================

alter table public.drivers
  add column if not exists approval_status public.driver_approval_status,
  add column if not exists status_kind public.driver_status_kind;

update public.drivers
set approval_status = case status::text
  when 'aprobado' then 'approved'::public.driver_approval_status
  when 'suspendido' then 'suspended'::public.driver_approval_status
  else 'pending_documents'::public.driver_approval_status
end
where approval_status is null;

update public.drivers
set status_kind = case
  when is_online = true then 'online'::public.driver_status_kind
  else 'offline'::public.driver_status_kind
end
where status_kind is null;

alter table public.drivers
  alter column approval_status set default 'pending_documents'::public.driver_approval_status,
  alter column approval_status set not null,
  alter column status_kind set default 'offline'::public.driver_status_kind,
  alter column status_kind set not null;

alter table public.vehicles
  add column if not exists vehicle_type public.vehicle_type,
  add column if not exists seat_capacity integer,
  add column if not exists status public.vehicle_status;

update public.vehicles
set vehicle_type = coalesce(vehicle_type, 'sedan'::public.vehicle_type),
    seat_capacity = coalesce(seat_capacity, 4),
    status = coalesce(status, 'pending'::public.vehicle_status);

do $$
begin
  if exists (
    select 1
    from public.vehicles
    where seat_capacity is null
       or seat_capacity < 1
       or seat_capacity > 12
  ) then
    raise exception 'A1 preflight failed: vehicles.seat_capacity must be between 1 and 12 before the constraint is added';
  end if;
end $$;

alter table public.vehicles
  alter column vehicle_type set default 'sedan'::public.vehicle_type,
  alter column vehicle_type set not null,
  alter column seat_capacity set default 4,
  alter column seat_capacity set not null,
  alter column status set default 'pending'::public.vehicle_status,
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vehicles'::regclass
      and conname = 'vehicles_openride_seat_capacity'
  ) then
    alter table public.vehicles
      add constraint vehicles_openride_seat_capacity
      check (seat_capacity between 1 and 12);
  end if;
end $$;

-- ============================================================================
-- Driver and vehicle documents
-- ============================================================================

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  doc_type public.driver_document_type not null,
  storage_path text not null,
  issued_on date,
  expires_on date,
  status public.document_status not null default 'pending',
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_documents_driver_idx
  on public.driver_documents(driver_id);

do $$
begin
  if exists (
    select 1
    from public.driver_documents
    where status = 'approved'
    group by driver_id, doc_type
    having count(*) > 1
  ) then
    raise exception 'A1 preflight failed: duplicate approved driver documents exist for the same driver and document type';
  end if;
end $$;

create unique index if not exists driver_documents_approved_unique
  on public.driver_documents(driver_id, doc_type)
  where status = 'approved';

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  doc_type public.vehicle_document_type not null,
  storage_path text not null,
  issued_on date,
  expires_on date,
  status public.document_status not null default 'pending',
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_documents_vehicle_idx
  on public.vehicle_documents(vehicle_id);

do $$
begin
  if exists (
    select 1
    from public.vehicle_documents
    where status = 'approved'
    group by vehicle_id, doc_type
    having count(*) > 1
  ) then
    raise exception 'A1 preflight failed: duplicate approved vehicle documents exist for the same vehicle and document type';
  end if;
end $$;

create unique index if not exists vehicle_documents_approved_unique
  on public.vehicle_documents(vehicle_id, doc_type)
  where status = 'approved';

-- ============================================================================
-- Offers, fare rules and example fare configuration
-- ============================================================================

create table if not exists public.trip_offers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  sent_at timestamptz not null default now(),
  responds_by timestamptz not null,
  responded_at timestamptz,
  offer_status public.offer_status not null default 'pending',
  pickup_eta_s integer,
  distance_to_pickup_m integer,
  created_at timestamptz not null default now()
);

create index if not exists trip_offers_trip_idx
  on public.trip_offers(trip_id, created_at desc);

create index if not exists trip_offers_driver_idx
  on public.trip_offers(driver_id, offer_status);

do $$
begin
  if exists (
    select 1
    from public.trip_offers
    where offer_status = 'pending'
    group by trip_id
    having count(*) > 1
  ) then
    raise exception 'A1 preflight failed: more than one pending trip offer exists for a trip';
  end if;

  if exists (
    select 1
    from public.trip_offers
    group by trip_id, driver_id
    having count(*) > 1
  ) then
    raise exception 'A1 preflight failed: duplicate trip offers exist for the same trip and driver';
  end if;
end $$;

create unique index if not exists trip_offers_one_pending_per_trip
  on public.trip_offers(trip_id)
  where offer_status = 'pending';

create unique index if not exists trip_offers_unique_driver_trip
  on public.trip_offers(trip_id, driver_id);

create table if not exists public.fare_rules (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  municipio_id text references public.municipios(id) on delete set null,
  vehicle_type public.vehicle_type not null default 'sedan',
  base_cents integer not null default 300 check (base_cents >= 0),
  per_km_cents integer not null default 125 check (per_km_cents >= 0),
  per_min_cents integer not null default 25 check (per_min_cents >= 0),
  minimum_cents integer not null default 500 check (minimum_cents >= 0),
  night_surcharge_pct integer not null default 0 check (night_surcharge_pct between 0 and 100),
  is_active boolean not null default true,
  active_from timestamptz not null default now(),
  active_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fare_rules_municipio_idx
  on public.fare_rules(municipio_id, vehicle_type, is_active);

insert into public.fare_rules (
  nombre, municipio_id, vehicle_type, base_cents, per_km_cents,
  per_min_cents, minimum_cents, night_surcharge_pct
)
select
  'Regla de ejemplo Dame Pon', null, 'sedan', 300, 125, 25, 500, 10
where not exists (
  select 1 from public.fare_rules where municipio_id is null and vehicle_type = 'sedan'
);

-- ============================================================================
-- Incidents, support and payment records
-- ============================================================================

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references public.profiles(id) on delete restrict,
  trip_id uuid references public.trips(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  passenger_id uuid references public.profiles(id) on delete set null,
  category public.incident_category not null,
  severity public.incident_severity not null default 'low',
  description text not null,
  attachments jsonb not null default '[]'::jsonb,
  status public.incident_status not null default 'open',
  resolution_notes text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incidents_status_idx
  on public.incidents(status, occurred_at desc);

create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  subject_user_id uuid references public.profiles(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  status public.support_case_status not null default 'open',
  priority public.support_case_priority not null default 'normal',
  assignee_id uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_cases_status_idx
  on public.support_cases(status, last_message_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null unique references public.trips(id) on delete restrict,
  passenger_id uuid not null references public.profiles(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete set null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  provider text not null default 'cash',
  provider_payment_id text unique,
  status public.payment_status not null default 'requires_action',
  failure_code text,
  failure_message text,
  captured_at timestamptz,
  refunded_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_status_idx
  on public.payments(status, created_at desc);

-- ============================================================================
-- Safe updated_at trigger for the adoption tables
-- ============================================================================

create or replace function public.openride_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_openride_driver_documents_updated_at on public.driver_documents;
create trigger trg_openride_driver_documents_updated_at
  before update on public.driver_documents
  for each row execute function public.openride_set_updated_at();

drop trigger if exists trg_openride_vehicle_documents_updated_at on public.vehicle_documents;
create trigger trg_openride_vehicle_documents_updated_at
  before update on public.vehicle_documents
  for each row execute function public.openride_set_updated_at();

drop trigger if exists trg_openride_fare_rules_updated_at on public.fare_rules;
create trigger trg_openride_fare_rules_updated_at
  before update on public.fare_rules
  for each row execute function public.openride_set_updated_at();

drop trigger if exists trg_openride_incidents_updated_at on public.incidents;
create trigger trg_openride_incidents_updated_at
  before update on public.incidents
  for each row execute function public.openride_set_updated_at();

drop trigger if exists trg_openride_support_cases_updated_at on public.support_cases;
create trigger trg_openride_support_cases_updated_at
  before update on public.support_cases
  for each row execute function public.openride_set_updated_at();

drop trigger if exists trg_openride_payments_updated_at on public.payments;
create trigger trg_openride_payments_updated_at
  before update on public.payments
  for each row execute function public.openride_set_updated_at();

-- ============================================================================
-- RLS for newly added tables
-- ============================================================================

alter table public.driver_documents enable row level security;
alter table public.vehicle_documents enable row level security;
alter table public.trip_offers enable row level security;
alter table public.fare_rules enable row level security;
alter table public.incidents enable row level security;
alter table public.support_cases enable row level security;
alter table public.payments enable row level security;

drop policy if exists driver_documents_owner_read on public.driver_documents;
create policy driver_documents_owner_read on public.driver_documents
  for select to authenticated
  using (driver_id = auth.uid() or is_admin());

drop policy if exists driver_documents_owner_insert on public.driver_documents;
create policy driver_documents_owner_insert on public.driver_documents
  for insert to authenticated
  with check (driver_id = auth.uid());

drop policy if exists driver_documents_admin_write on public.driver_documents;
create policy driver_documents_admin_write on public.driver_documents
  for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists vehicle_documents_owner_read on public.vehicle_documents;
create policy vehicle_documents_owner_read on public.vehicle_documents
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from public.vehicles v
      where v.id = vehicle_documents.vehicle_id and v.driver_id = auth.uid()
    )
  );

drop policy if exists vehicle_documents_admin_write on public.vehicle_documents;
create policy vehicle_documents_admin_write on public.vehicle_documents
  for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists trip_offers_driver_read on public.trip_offers;
create policy trip_offers_driver_read on public.trip_offers
  for select to authenticated
  using (driver_id = auth.uid() or is_admin());

drop policy if exists trip_offers_passenger_status_read on public.trip_offers;
create policy trip_offers_passenger_status_read on public.trip_offers
  for select to authenticated
  using (
    exists (
      select 1
      from public.trips
      where trips.id = trip_offers.trip_id
        and trips.passenger_id = auth.uid()
    )
  );

drop policy if exists trip_offers_admin_write on public.trip_offers;
create policy trip_offers_admin_write on public.trip_offers
  for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists fare_rules_authenticated_read on public.fare_rules;
create policy fare_rules_authenticated_read on public.fare_rules
  for select to authenticated
  using (true);

drop policy if exists fare_rules_admin_write on public.fare_rules;
create policy fare_rules_admin_write on public.fare_rules
  for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists incidents_participant_read on public.incidents;
create policy incidents_participant_read on public.incidents
  for select to authenticated
  using (
    reported_by = auth.uid()
    or passenger_id = auth.uid()
    or driver_id = auth.uid()
    or is_admin()
  );

drop policy if exists incidents_authenticated_insert on public.incidents;
create policy incidents_authenticated_insert on public.incidents
  for insert to authenticated
  with check (reported_by = auth.uid());

drop policy if exists incidents_admin_write on public.incidents;
create policy incidents_admin_write on public.incidents
  for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists support_cases_participant_read on public.support_cases;
create policy support_cases_participant_read on public.support_cases
  for select to authenticated
  using (
    opened_by = auth.uid()
    or subject_user_id = auth.uid()
    or assignee_id = auth.uid()
    or is_admin()
  );

drop policy if exists support_cases_authenticated_insert on public.support_cases;
create policy support_cases_authenticated_insert on public.support_cases
  for insert to authenticated
  with check (opened_by = auth.uid());

drop policy if exists support_cases_admin_write on public.support_cases;
create policy support_cases_admin_write on public.support_cases
  for all to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists payments_participant_read on public.payments;
create policy payments_participant_read on public.payments
  for select to authenticated
  using (passenger_id = auth.uid() or driver_id = auth.uid() or is_admin());

drop policy if exists payments_admin_write on public.payments;
create policy payments_admin_write on public.payments
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ============================================================================
-- Rebuild existing trip access policies for the new enum
-- ============================================================================

drop policy if exists "authenticated_participants_read_openride_trips" on public.trips;
create policy "authenticated_participants_read_openride_trips"
on public.trips
for select to authenticated
using (auth.uid() = passenger_id or auth.uid() = driver_id or is_admin());

drop policy if exists "approved_online_drivers_read_openride_requests" on public.trips;
create policy "approved_online_drivers_read_openride_requests"
on public.trips
for select to authenticated
using (
  status in ('requested'::public.trip_status, 'offered'::public.trip_status)
  and exists (
    select 1
    from public.profiles
    join public.drivers on drivers.id = profiles.id
    where profiles.id = auth.uid()
      and profiles.role = 'conductor'::public.user_role
      and drivers.status = 'aprobado'::public.driver_status
      and drivers.is_online = true
  )
);

drop policy if exists "authenticated_passengers_insert_openride_requests" on public.trips;
create policy "authenticated_passengers_insert_openride_requests"
on public.trips
for insert to authenticated
with check (
  auth.uid() = passenger_id
  and driver_id is null
  and status = 'requested'::public.trip_status
  and accepted_at is null
  and started_at is null
  and completed_at is null
  and fare_estimate is null
  and fare_final is null
  and distance_km is null
  and passenger_pin ~ '^[0-9]{4}$'
);

-- Column privileges complement RLS: drivers may read open trips, but never the
-- passenger PIN. The passenger-only view is security-definer and filters by
-- auth.uid() before exposing that column.
revoke select on table public.trips from authenticated;
grant select (
  id, status, passenger_id, driver_id,
  pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng,
  fare_estimate, fare_final, distance_km,
  requested_at, accepted_at, started_at, completed_at,
  municipio, allow_cross_municipio, municipio_origen, municipio_destino,
  arrived_at, cancelled_at, cancelled_by, cancel_reason, payment_status
) on table public.trips to authenticated;

create or replace view public.passenger_trips as
select
  trips.id,
  trips.status,
  trips.passenger_id,
  trips.driver_id,
  trips.pickup_address,
  trips.pickup_lat,
  trips.pickup_lng,
  trips.dropoff_address,
  trips.dropoff_lat,
  trips.dropoff_lng,
  trips.fare_estimate,
  trips.fare_final,
  trips.distance_km,
  trips.requested_at,
  trips.accepted_at,
  trips.started_at,
  trips.completed_at,
  trips.municipio,
  trips.allow_cross_municipio,
  trips.municipio_origen,
  trips.municipio_destino,
  trips.arrived_at,
  trips.cancelled_at,
  trips.cancelled_by,
  trips.cancel_reason,
  trips.payment_status,
  trips.passenger_pin
from public.trips
where trips.passenger_id = auth.uid();

revoke all on public.passenger_trips from public, anon;
grant select on public.passenger_trips to authenticated;

-- ============================================================================
-- Preserve existing RPC behavior against the new status values
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where pg_namespace.nspname = 'public'
      and pg_type.typname = 'openride_trip_result'
  ) then
    create type public.openride_trip_result as (
      id uuid,
      status public.trip_status,
      passenger_id uuid,
      driver_id uuid,
      pickup_address text,
      pickup_lat double precision,
      pickup_lng double precision,
      dropoff_address text,
      dropoff_lat double precision,
      dropoff_lng double precision,
      fare_estimate numeric,
      fare_final numeric,
      distance_km numeric,
      requested_at timestamptz,
      accepted_at timestamptz,
      started_at timestamptz,
      completed_at timestamptz,
      municipio text,
      allow_cross_municipio boolean,
      municipio_origen text,
      municipio_destino text,
      arrived_at timestamptz,
      cancelled_at timestamptz,
      cancelled_by text,
      cancel_reason text,
      payment_status public.trip_payment_status
    );
  end if;
end $$;

create or replace function public.expand_trip_search(p_trip_id uuid)
returns setof public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_trip public.trips;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  update public.trips
  set allow_cross_municipio = true
  where id = p_trip_id
    and passenger_id = auth.uid()
    and status in (
      'requested'::public.trip_status,
      'offered'::public.trip_status
    )
  returning * into updated_trip;

  if not found then
    raise exception 'Only the passenger can expand a requested or offered trip'
      using errcode = '42501';
  end if;

  return next updated_trip;
end;
$$;

revoke all on function public.expand_trip_search(uuid) from public, anon;
grant execute on function public.expand_trip_search(uuid) to authenticated;

drop function if exists public.accept_trip(uuid);
create or replace function public.accept_trip(p_trip_id uuid)
returns setof public.openride_trip_result
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trips
  set driver_id = auth.uid(),
      status = 'accepted'::public.trip_status,
      accepted_at = clock_timestamp()
  where id = p_trip_id
    and status in ('requested'::public.trip_status, 'offered'::public.trip_status)
    and exists (
      select 1
      from public.profiles
      join public.drivers on drivers.id = profiles.id
      where profiles.id = auth.uid()
        and profiles.role = 'conductor'::public.user_role
        and drivers.status = 'aprobado'::public.driver_status
        and drivers.is_online = true
    )
  returning id into p_trip_id;

  if not found then
    raise exception 'Only an approved online driver can accept an open trip'
      using errcode = '42501';
  end if;

  return query
  select
    t.id, t.status, t.passenger_id, t.driver_id,
    t.pickup_address, t.pickup_lat, t.pickup_lng,
    t.dropoff_address, t.dropoff_lat, t.dropoff_lng,
    t.fare_estimate, t.fare_final, t.distance_km,
    t.requested_at, t.accepted_at, t.started_at, t.completed_at,
    t.municipio, t.allow_cross_municipio, t.municipio_origen,
    t.municipio_destino, t.arrived_at, t.cancelled_at,
    t.cancelled_by, t.cancel_reason, t.payment_status
  from public.trips t
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.accept_trip(uuid) from public, anon;
grant execute on function public.accept_trip(uuid) to authenticated;

drop function if exists public.start_trip(uuid);
drop function if exists public.start_trip(uuid, text);
create or replace function public.start_trip(
  p_trip_id uuid,
  p_passenger_pin text
)
returns setof public.openride_trip_result
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_passenger_pin is null or p_passenger_pin !~ '^[0-9]{4}$' then
    raise exception 'A valid four-digit passenger PIN is required'
      using errcode = '22023';
  end if;

  update public.trips
  set status = 'in_progress'::public.trip_status,
      started_at = clock_timestamp()
  where id = p_trip_id
    and driver_id = auth.uid()
    and passenger_pin = p_passenger_pin
    and status in ('accepted'::public.trip_status, 'arrived'::public.trip_status);

  if not found then
    raise exception 'Only the assigned driver with the passenger PIN can start this trip'
      using errcode = '42501';
  end if;

  return query
  select
    t.id, t.status, t.passenger_id, t.driver_id,
    t.pickup_address, t.pickup_lat, t.pickup_lng,
    t.dropoff_address, t.dropoff_lat, t.dropoff_lng,
    t.fare_estimate, t.fare_final, t.distance_km,
    t.requested_at, t.accepted_at, t.started_at, t.completed_at,
    t.municipio, t.allow_cross_municipio, t.municipio_origen,
    t.municipio_destino, t.arrived_at, t.cancelled_at,
    t.cancelled_by, t.cancel_reason, t.payment_status
  from public.trips t
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.start_trip(uuid, text) from public, anon;
grant execute on function public.start_trip(uuid, text) to authenticated;

drop function if exists public.complete_trip(uuid);
create or replace function public.complete_trip(p_trip_id uuid)
returns setof public.openride_trip_result
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trips
  set status = 'completed'::public.trip_status,
      completed_at = clock_timestamp()
  where id = p_trip_id
    and driver_id = auth.uid()
    and status = 'in_progress'::public.trip_status
  returning id into p_trip_id;

  if not found then
    raise exception 'Only the assigned driver can complete an in-progress trip'
      using errcode = '42501';
  end if;

  return query
  select
    t.id, t.status, t.passenger_id, t.driver_id,
    t.pickup_address, t.pickup_lat, t.pickup_lng,
    t.dropoff_address, t.dropoff_lat, t.dropoff_lng,
    t.fare_estimate, t.fare_final, t.distance_km,
    t.requested_at, t.accepted_at, t.started_at, t.completed_at,
    t.municipio, t.allow_cross_municipio, t.municipio_origen,
    t.municipio_destino, t.arrived_at, t.cancelled_at,
    t.cancelled_by, t.cancel_reason, t.payment_status
  from public.trips t
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.complete_trip(uuid) from public, anon;
grant execute on function public.complete_trip(uuid) to authenticated;

drop function if exists public.cancel_trip(uuid);
drop function if exists public.cancel_trip(uuid, text);
create or replace function public.cancel_trip(
  p_trip_id uuid,
  p_reason text default null
)
returns setof public.openride_trip_result
language plpgsql
security definer
set search_path = public
as $$
declare
  trip_row public.trips;
  actor text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select *
  into trip_row
  from public.trips
  where id = p_trip_id
  for update;

  if not found then
    raise exception 'Trip not found'
      using errcode = 'P0002';
  end if;

  if public.is_admin() then
    actor := 'admin';
  elsif trip_row.passenger_id = auth.uid()
    and trip_row.status in (
      'requested'::public.trip_status,
      'offered'::public.trip_status,
      'accepted'::public.trip_status,
      'arrived'::public.trip_status
    ) then
    actor := 'passenger';
  elsif trip_row.driver_id = auth.uid()
    and trip_row.status in (
      'accepted'::public.trip_status,
      'arrived'::public.trip_status,
      'in_progress'::public.trip_status
    ) then
    actor := 'driver';
  else
    raise exception 'Only the passenger, assigned driver or an admin can cancel this trip'
      using errcode = '42501';
  end if;

  update public.trips
  set status = 'cancelled'::public.trip_status,
      cancelled_at = clock_timestamp(),
      cancelled_by = actor,
      cancel_reason = nullif(trim(p_reason), '')
  where id = p_trip_id
  returning * into trip_row;

  return query
  select
    t.id, t.status, t.passenger_id, t.driver_id,
    t.pickup_address, t.pickup_lat, t.pickup_lng,
    t.dropoff_address, t.dropoff_lat, t.dropoff_lng,
    t.fare_estimate, t.fare_final, t.distance_km,
    t.requested_at, t.accepted_at, t.started_at, t.completed_at,
    t.municipio, t.allow_cross_municipio, t.municipio_origen,
    t.municipio_destino, t.arrived_at, t.cancelled_at,
    t.cancelled_by, t.cancel_reason, t.payment_status
  from public.trips t
  where t.id = p_trip_id;
end;
$$;

revoke all on function public.cancel_trip(uuid, text) from public, anon;
grant execute on function public.cancel_trip(uuid, text) to authenticated;

create or replace function public.get_trip_participant_details(p_trip_id uuid)
returns table (
  trip_id uuid,
  passenger_id uuid,
  passenger_name text,
  passenger_avatar_url text,
  driver_id uuid,
  driver_name text,
  driver_avatar_url text,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    trips.id,
    trips.passenger_id,
    passenger_profile.full_name,
    passenger_profile.avatar_url,
    trips.driver_id,
    driver_profile.full_name,
    driver_profile.avatar_url,
    vehicle.make,
    vehicle.model,
    vehicle.color,
    vehicle.plate
  from public.trips
  left join public.profiles as passenger_profile
    on passenger_profile.id = trips.passenger_id
  left join public.profiles as driver_profile
    on driver_profile.id = trips.driver_id
  left join lateral (
    select vehicles.make, vehicles.model, vehicles.color, vehicles.plate
    from public.vehicles
    where vehicles.driver_id = trips.driver_id
    order by vehicles.id asc
    limit 1
  ) as vehicle on true
  where trips.id = p_trip_id
    and trips.status in (
      'completed'::public.trip_status,
      'accepted'::public.trip_status,
      'arrived'::public.trip_status,
      'in_progress'::public.trip_status
    )
    and (
      trips.passenger_id = (select auth.uid())
      or trips.driver_id = (select auth.uid())
    );
$$;

revoke all on function public.get_trip_participant_details(uuid) from public, anon;
grant execute on function public.get_trip_participant_details(uuid) to authenticated;

-- The existing municipality functions continue to write the exact catalog
-- name. A2 will add municipality-aware dispatch ranking; this migration does
-- not change the base/active municipality or return/stay behavior.

-- ============================================================================
-- Manual rollback guidance (commented; do not run automatically)
-- ============================================================================
-- A1 changes existing trips, drivers and vehicles, so a rollback must be
-- planned against respaldo_20260920 and executed with the application offline.
-- Do not drop the new enums, columns, indexes, tables, views or functions until
-- dependent policies, triggers and application code have been removed.
--
-- Suggested manual sequence:
--   1. Restore the affected public.trips, public.drivers and public.vehicles
--      rows from respaldo_20260920 after reviewing post-migration changes.
--   2. Recreate the legacy public.trip_status type and convert trips.status back
--      from the OpenRide values using the preserved status_legacy column.
--   3. Restore the pre-A1 trips policies, grants and RPC definitions.
--   4. Drop passenger_trips, the OpenRide indexes, triggers, functions and
--      adoption tables only after their callers and RLS policies are removed.
--   5. Drop the OpenRide enum types last, only after no column or policy refers
--      to them. Keep the backup untouched until the rollback is verified.

commit;