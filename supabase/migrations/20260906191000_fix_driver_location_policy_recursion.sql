create or replace function public.is_active_trip_passenger_for_driver(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trips
    where trips.driver_id = p_driver_id
      and trips.passenger_id = (select auth.uid())
      and trips.status in ('aceptado', 'en_curso')
  );
$$;

revoke all on function public.is_active_trip_passenger_for_driver(uuid) from public;
grant execute on function public.is_active_trip_passenger_for_driver(uuid) to authenticated;

drop policy if exists "assigned_passenger_can_view_driver_location" on public.drivers;

create policy "assigned_passenger_can_view_driver_location"
on public.drivers
for select
to authenticated
using ((select public.is_active_trip_passenger_for_driver(drivers.id)));