-- RLS hardening:
-- * clients cannot UPDATE trips directly;
-- * trip state changes happen through validated SECURITY DEFINER functions;
-- * profile/driver privileged columns are not writable by authenticated clients;
-- * trip inserts start in the only valid initial state;
-- * acceptance remains an atomic compare-and-set operation.

-- Profiles: authenticated clients may create/update ordinary profile fields only.
revoke insert on public.profiles from public, anon, authenticated;
grant insert (id, full_name, phone, avatar_url, push_token)
on public.profiles to authenticated;

revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, phone, avatar_url, push_token)
on public.profiles to authenticated;

drop policy if exists "authenticated_users_insert_own_profile"
on public.profiles;

drop policy if exists "authenticated_users_update_own_profile"
on public.profiles;

create policy "authenticated_users_insert_safe_profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "authenticated_users_update_safe_profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Only an admin/server function may change role or the accumulated rating.
create or replace function public.admin_set_profile_privileged_fields(
  p_user_id uuid,
  p_role public.user_role,
  p_rating numeric
)
returns setof public.profiles
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change profile role or rating'
      using errcode = '42501';
  end if;

  if p_rating < 0 or p_rating > 5 then
    raise exception 'Profile rating must be between 0 and 5'
      using errcode = '22023';
  end if;

  return query
  update public.profiles
  set role = p_role,
      rating = p_rating
  where id = p_user_id
  returning *;
end;
$$;

revoke all on function public.admin_set_profile_privileged_fields(uuid, public.user_role, numeric)
from public;
grant execute on function public.admin_set_profile_privileged_fields(uuid, public.user_role, numeric)
to authenticated;

-- Drivers: registration and runtime location/availability are client-writable.
-- Approval state and license identity are not.
revoke insert on public.drivers from public, anon, authenticated;
grant insert (id, license_number, is_online, current_lat, current_lng, updated_at)
on public.drivers to authenticated;

revoke update on public.drivers from public, anon, authenticated;
grant update (is_online, current_lat, current_lng, updated_at)
on public.drivers to authenticated;

drop policy if exists "authenticated_drivers_insert_own_record"
on public.drivers;

drop policy if exists "authenticated_drivers_update_own_record"
on public.drivers;

create policy "authenticated_drivers_insert_pending_record"
on public.drivers
for insert
to authenticated
with check (
  auth.uid() = id
  and status = 'pendiente'::public.driver_status
  and is_online = false
);

create policy "authenticated_drivers_update_safe_runtime_fields"
on public.drivers
for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and (
    (status = 'aprobado'::public.driver_status)
    or is_online = false
  )
);

create or replace function public.admin_set_driver_status(
  p_driver_id uuid,
  p_status public.driver_status
)
returns setof public.drivers
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change driver approval state'
      using errcode = '42501';
  end if;

  return query
  update public.drivers
  set status = p_status,
      is_online = case
        when p_status = 'aprobado'::public.driver_status then is_online
        else false
      end
  where id = p_driver_id
  returning *;
end;
$$;

revoke all on function public.admin_set_driver_status(uuid, public.driver_status)
from public;
grant execute on function public.admin_set_driver_status(uuid, public.driver_status)
to authenticated;

-- Trips: clients can request trips, but cannot choose a driver, status, fare,
-- distance, payment state, or lifecycle timestamps at insert time.
revoke insert on public.trips from public, anon, authenticated;
grant insert (
  passenger_id,
  pickup_address,
  pickup_lat,
  pickup_lng,
  dropoff_address,
  dropoff_lat,
  dropoff_lng,
  requested_at
)
on public.trips to authenticated;

revoke update on public.trips from public, anon, authenticated;

drop policy if exists "authenticated_passengers_insert_own_trips"
on public.trips;

drop policy if exists "authenticated_participants_update_shared_trips"
on public.trips;

create policy "authenticated_passengers_insert_initial_trips"
on public.trips
for insert
to authenticated
with check (
  auth.uid() = passenger_id
  and driver_id is null
  and status = 'buscando_conductor'::public.trip_status
  and accepted_at is null
  and started_at is null
  and completed_at is null
  and fare_estimate is null
  and fare_final is null
  and distance_km is null
);

-- No direct UPDATE policy remains. All lifecycle changes use the functions below.

create or replace function public.start_trip(p_trip_id uuid)
returns setof public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_trip public.trips;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  update public.trips
  set status = 'en_curso'::public.trip_status,
      started_at = clock_timestamp()
  where id = p_trip_id
    and driver_id = auth.uid()
    and status = 'aceptado'::public.trip_status
  returning * into updated_trip;

  if not found then
    raise exception 'Only the assigned driver can start an accepted trip'
      using errcode = '42501';
  end if;

  return next updated_trip;
end;
$$;

create or replace function public.complete_trip(p_trip_id uuid)
returns setof public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_trip public.trips;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  update public.trips
  set status = 'completado'::public.trip_status,
      completed_at = clock_timestamp()
  where id = p_trip_id
    and driver_id = auth.uid()
    and status = 'en_curso'::public.trip_status
  returning * into updated_trip;

  if not found then
    raise exception 'Only the assigned driver can complete an in-progress trip'
      using errcode = '42501';
  end if;

  return next updated_trip;
end;
$$;

create or replace function public.cancel_trip(p_trip_id uuid)
returns setof public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_trip public.trips;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  update public.trips
  set status = 'cancelado'::public.trip_status
  where id = p_trip_id
    and passenger_id = auth.uid()
    and status in (
      'buscando_conductor'::public.trip_status,
      'aceptado'::public.trip_status
    )
  returning * into updated_trip;

  if not found then
    raise exception 'Only the passenger can cancel a searching or accepted trip'
      using errcode = '42501';
  end if;

  return next updated_trip;
end;
$$;

revoke all on function public.start_trip(uuid) from public;
revoke all on function public.complete_trip(uuid) from public;
revoke all on function public.cancel_trip(uuid) from public;
grant execute on function public.start_trip(uuid) to authenticated;
grant execute on function public.complete_trip(uuid) to authenticated;
grant execute on function public.cancel_trip(uuid) to authenticated;

-- Acceptance is already an atomic UPDATE ... WHERE status/open assignment.
-- Recreate it here alongside the other lifecycle functions so its grants and
-- search path remain explicit.
create or replace function public.accept_trip(p_trip_id uuid)
returns setof public.trips
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    join public.drivers on drivers.id = profiles.id
    where profiles.id = auth.uid()
      and profiles.role = 'conductor'::public.user_role
      and drivers.status = 'aprobado'::public.driver_status
      and drivers.is_online = true
  ) then
    raise exception 'Only approved online drivers can accept trips'
      using errcode = '42501';
  end if;

  return query
  update public.trips
  set driver_id = auth.uid(),
      status = 'aceptado'::public.trip_status,
      accepted_at = clock_timestamp()
  where id = p_trip_id
    and status = 'buscando_conductor'::public.trip_status
    and driver_id is null
  returning *;
end;
$$;

revoke all on function public.accept_trip(uuid) from public;
grant execute on function public.accept_trip(uuid) to authenticated;