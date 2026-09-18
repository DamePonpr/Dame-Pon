-- Participants need a small, privacy-safe view of the person they shared a
-- completed trip with. Keep the existing table RLS owner-only and expose only
-- the fields needed by the completion screen through this checked RPC.
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
    select
      vehicles.make,
      vehicles.model,
      vehicles.color,
      vehicles.plate
    from public.vehicles
    where vehicles.driver_id = trips.driver_id
    order by vehicles.id asc
    limit 1
  ) as vehicle on true
  where trips.id = p_trip_id
    and trips.status = 'completado'::public.trip_status
    and (
      trips.passenger_id = (select auth.uid())
      or trips.driver_id = (select auth.uid())
    );
$$;

revoke all on function public.get_trip_participant_details(uuid) from public, anon;
grant execute on function public.get_trip_participant_details(uuid) to authenticated;