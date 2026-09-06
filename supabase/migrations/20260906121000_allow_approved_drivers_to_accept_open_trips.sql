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
      and profiles.role = 'conductor'
      and drivers.status = 'aprobado'
      and drivers.is_online = true
  ) then
    raise exception 'Only approved online drivers can accept trips'
      using errcode = '42501';
  end if;

  return query
  update public.trips
  set
    driver_id = auth.uid(),
    status = 'aceptado',
    accepted_at = clock_timestamp()
  where id = p_trip_id
    and status = 'buscando_conductor'
    and driver_id is null
  returning *;
end;
$$;

revoke all on function public.accept_trip(uuid) from public;
grant execute on function public.accept_trip(uuid) to authenticated;