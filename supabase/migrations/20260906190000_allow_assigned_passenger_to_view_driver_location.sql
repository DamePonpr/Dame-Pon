create policy "assigned_passenger_can_view_driver_location"
on public.drivers
for select
to authenticated
using (
  exists (
    select 1
    from public.trips
    where trips.driver_id = drivers.id
      and trips.passenger_id = auth.uid()
      and trips.status in ('aceptado', 'en_curso')
  )
);