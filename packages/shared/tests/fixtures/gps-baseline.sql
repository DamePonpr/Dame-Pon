-- Disposable LOCAL PostgreSQL only. Synthetic schema, roles and fixtures.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select (auth.jwt()->>'sub')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create type public.user_role as enum ('pasajero','conductor','admin');
create type public.driver_status_kind as enum ('offline','online','on_trip','break');
create type public.driver_approval_status as enum ('pending_documents','pending_review','approved','rejected','suspended');
create type public.trip_status as enum ('requested','offered','accepted','arrived','in_progress','completed','cancelled','solicitado','aceptado','en_curso','completado','cancelado');
create type public.trip_payment_status as enum ('pending','paid','failed','refunded');
create table public.profiles (id uuid primary key, role public.user_role not null);
create table public.municipios (nombre text primary key);
create table public.drivers (
  id uuid primary key references public.profiles(id), license_number text, review_notes text,
  approval_status public.driver_approval_status not null default 'pending_documents',
  status text not null default 'pendiente', status_kind public.driver_status_kind not null default 'offline',
  is_online boolean not null default false, current_lat double precision, current_lng double precision,
  updated_at timestamptz default now(), municipio_base text
);
create table public.trips (
  id uuid primary key, status public.trip_status not null default 'requested',
  passenger_id uuid not null references public.profiles(id), driver_id uuid references public.drivers(id),
  pickup_address text, pickup_lat double precision, pickup_lng double precision,
  dropoff_address text, dropoff_lat double precision, dropoff_lng double precision,
  fare_estimate numeric, fare_final numeric, distance_km numeric,
  requested_at timestamptz default now(), accepted_at timestamptz, started_at timestamptz, completed_at timestamptz,
  municipio text, allow_cross_municipio boolean, municipio_origen text, municipio_destino text,
  arrived_at timestamptz, cancelled_at timestamptz, cancelled_by text, cancel_reason text,
  payment_status public.trip_payment_status, passenger_pin text default '1234'
);
create function public.is_admin() returns boolean language sql stable security definer as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin')
$$;
create function public.is_active_trip_passenger_for_driver(p_driver_id uuid)
returns boolean language sql stable security definer as $$
  select exists(select 1 from public.trips where driver_id=p_driver_id and passenger_id=auth.uid()
    and status::text in ('aceptado','en_curso'))
$$;
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.trips enable row level security;
create policy profile_own on public.profiles for select to authenticated using (id=auth.uid());
create policy authenticated_drivers_read_own_record on public.drivers for select to authenticated using (id=auth.uid());
create policy assigned_passenger_can_view_driver_location on public.drivers for select to authenticated
using (public.is_active_trip_passenger_for_driver(id));
create policy authenticated_drivers_update_safe_runtime_fields on public.drivers for update to authenticated
using (id=auth.uid()) with check(id=auth.uid() and (approval_status='approved' or is_online=false));
create policy authenticated_drivers_insert_pending_record on public.drivers for insert to authenticated
with check(id=auth.uid() and approval_status='pending_documents' and status='pendiente' and not is_online);
create policy authenticated_participants_read_openride_trips on public.trips for select to authenticated
using(auth.uid()=passenger_id or auth.uid()=driver_id or public.is_admin());
create policy approved_online_drivers_read_openride_requests on public.trips for select to authenticated
using(status::text in ('requested','offered') and exists (
  select 1 from public.drivers where id=auth.uid() and approval_status='approved' and is_online and status_kind='online'
));
grant select on public.profiles, public.municipios to authenticated;
grant select, insert, update on public.drivers, public.trips to authenticated;
-- Existing approval guards, retained by the pending migrations.
create function public.guard_driver_privileged_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and not public.is_admin() then
    if new.status is distinct from old.status or new.review_notes is distinct from old.review_notes then
      raise exception 'Solo administración cambia aprobación/notas' using errcode='42501';
    end if;
    if new.approval_status is distinct from old.approval_status and not (
      old.approval_status in ('pending_documents','pending_review')
      and new.approval_status in ('pending_documents','pending_review')
    ) then raise exception 'Solo administración aprueba' using errcode='42501'; end if;
  end if;
  return new;
end;
$$;
create trigger trg_guard_driver_privileged_fields before update on public.drivers
for each row execute function public.guard_driver_privileged_fields();
create function public.openride_require_approved_driver()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.is_online and new.approval_status <> 'approved' then
    raise exception 'Se requiere aprobación' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger trg_openride_require_approved_driver before insert or update of is_online,approval_status on public.drivers
for each row execute function public.openride_require_approved_driver();
-- Include table-wide grants, as in the real baseline, to catch false security
-- from column revokes. No private table should ever inherit these accidentally.
alter default privileges in schema public grant all on tables to anon, authenticated;
create publication supabase_realtime for table public.drivers, public.trips;
