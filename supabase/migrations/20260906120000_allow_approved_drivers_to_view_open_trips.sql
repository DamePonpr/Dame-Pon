create policy "approved_online_drivers_can_view_open_trips"
on public.trips
for select
to authenticated
using (
  status = 'buscando_conductor'
  and exists (
    select 1
    from public.profiles
    join public.drivers on drivers.id = profiles.id
    where profiles.id = auth.uid()
      and profiles.role = 'conductor'
      and drivers.status = 'aprobado'
      and drivers.is_online = true
  )
);