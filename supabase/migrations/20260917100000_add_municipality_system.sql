-- Dame Pon: municipio base/activo del conductor y clasificación server-side
-- de cada viaje. La app nunca puede escribir los municipios protegidos.

create table if not exists public.municipios (
  id text primary key,
  nombre text not null unique,
  centro_lat double precision not null,
  centro_lng double precision not null
);

insert into public.municipios (id, nombre, centro_lat, centro_lng) values
  ('adjuntas', 'Adjuntas', 18.1636, -66.7220),
  ('aguada', 'Aguada', 18.3802, -67.1882),
  ('aguadilla', 'Aguadilla', 18.4274, -67.1541),
  ('aguas-buenas', 'Aguas Buenas', 18.2569, -66.1029),
  ('aibonito', 'Aibonito', 18.1397, -66.2660),
  ('anasco', 'Añasco', 18.2833, -67.1400),
  ('arecibo', 'Arecibo', 18.4724, -66.7157),
  ('arroyo', 'Arroyo', 17.9658, -66.0610),
  ('barceloneta', 'Barceloneta', 18.4505, -66.5385),
  ('barranquitas', 'Barranquitas', 18.1866, -66.3063),
  ('bayamon', 'Bayamón', 18.3986, -66.1557),
  ('cabo-rojo', 'Cabo Rojo', 18.0866, -67.1457),
  ('caguas', 'Caguas', 18.2341, -66.0485),
  ('camuy', 'Camuy', 18.4838, -66.8449),
  ('canovanas', 'Canóvanas', 18.3808, -65.9078),
  ('carolina', 'Carolina', 18.3808, -65.9574),
  ('catano', 'Cataño', 18.4413, -66.1182),
  ('cayey', 'Cayey', 18.1119, -66.1660),
  ('ceiba', 'Ceiba', 18.2647, -65.6488),
  ('ciales', 'Ciales', 18.3366, -66.4688),
  ('cidra', 'Cidra', 18.1758, -66.1613),
  ('coamo', 'Coamo', 18.0800, -66.3579),
  ('comerio', 'Comerío', 18.2208, -66.2210),
  ('corozal', 'Corozal', 18.3416, -66.3177),
  ('culebra', 'Culebra', 18.3105, -65.3035),
  ('dorado', 'Dorado', 18.4594, -66.2677),
  ('fajardo', 'Fajardo', 18.3258, -65.6524),
  ('florida', 'Florida', 18.3633, -66.5602),
  ('guanica', 'Guánica', 17.9716, -66.9080),
  ('guayama', 'Guayama', 17.9841, -66.1138),
  ('guayanilla', 'Guayanilla', 18.0200, -66.7918),
  ('guaynabo', 'Guaynabo', 18.3613, -66.1107),
  ('gurabo', 'Gurabo', 18.2541, -65.9729),
  ('hatillo', 'Hatillo', 18.4863, -66.8254),
  ('hormigueros', 'Hormigueros', 18.1330, -67.1120),
  ('humacao', 'Humacao', 18.1497, -65.8274),
  ('isabela', 'Isabela', 18.5008, -67.0244),
  ('jayuya', 'Jayuya', 18.2186, -66.5913),
  ('juana-diaz', 'Juana Díaz', 18.0525, -66.5066),
  ('juncos', 'Juncos', 18.2275, -65.9213),
  ('lajas', 'Lajas', 18.0500, -67.0594),
  ('lares', 'Lares', 18.2947, -66.8771),
  ('las-marias', 'Las Marías', 18.2519, -66.9927),
  ('las-piedras', 'Las Piedras', 18.1830, -65.8663),
  ('loiza', 'Loíza', 18.4322, -65.8785),
  ('luquillo', 'Luquillo', 18.3725, -65.7166),
  ('manati', 'Manatí', 18.4274, -66.4921),
  ('maricao', 'Maricao', 18.1808, -66.9799),
  ('maunabo', 'Maunabo', 18.0075, -65.8993),
  ('mayaguez', 'Mayagüez', 18.2011, -67.1396),
  ('moca', 'Moca', 18.3947, -67.1132),
  ('morovis', 'Morovis', 18.3258, -66.4066),
  ('naguabo', 'Naguabo', 18.2119, -65.7357),
  ('naranjito', 'Naranjito', 18.3008, -66.2449),
  ('orocovis', 'Orocovis', 18.2269, -66.3918),
  ('patillas', 'Patillas', 18.0064, -66.0157),
  ('penuelas', 'Peñuelas', 18.0597, -66.7216),
  ('ponce', 'Ponce', 18.0111, -66.6141),
  ('quebradillas', 'Quebradillas', 18.4738, -66.9385),
  ('rincon', 'Rincón', 18.3402, -67.2499),
  ('rio-grande', 'Río Grande', 18.3802, -65.8329),
  ('sabana-grande', 'Sabana Grande', 18.0808, -66.9605),
  ('salinas', 'Salinas', 17.9775, -66.2979),
  ('san-german', 'San Germán', 18.0816, -67.0449),
  ('san-juan', 'San Juan', 18.4655, -66.1057),
  ('san-lorenzo', 'San Lorenzo', 18.1888, -65.9616),
  ('san-sebastian', 'San Sebastián', 18.3366, -66.9938),
  ('santa-isabel', 'Santa Isabel', 17.9661, -66.4049),
  ('toa-alta', 'Toa Alta', 18.3883, -66.2482),
  ('toa-baja', 'Toa Baja', 18.4444, -66.2596),
  ('trujillo-alto', 'Trujillo Alto', 18.3547, -66.0074),
  ('utuado', 'Utuado', 18.2655, -66.7005),
  ('vega-alta', 'Vega Alta', 18.4122, -66.3313),
  ('vega-baja', 'Vega Baja', 18.4444, -66.3985),
  ('vieques', 'Vieques', 18.1497, -65.4427),
  ('villalba', 'Villalba', 18.1283, -66.4985),
  ('yabucoa', 'Yabucoa', 18.0500, -65.8793),
  ('yauco', 'Yauco', 18.0341, -66.8499)
on conflict (id) do update set
  nombre = excluded.nombre,
  centro_lat = excluded.centro_lat,
  centro_lng = excluded.centro_lng;

alter table public.municipios enable row level security;
drop policy if exists "authenticated_users_can_read_municipios" on public.municipios;
create policy "authenticated_users_can_read_municipios"
on public.municipios
for select
to authenticated
using (true);
grant select on public.municipios to authenticated;

create or replace function public.find_nearest_municipio(
  p_lat double precision,
  p_lng double precision
)
returns text
language sql
stable
set search_path = ''
as $$
  select m.nombre
  from public.municipios m
  where p_lat between -90 and 90
    and p_lng between -180 and 180
  order by
    6371 * 2 * asin(sqrt(
      power(sin(radians(m.centro_lat - p_lat) / 2), 2)
      + cos(radians(p_lat))
        * cos(radians(m.centro_lat))
        * power(sin(radians(m.centro_lng - p_lng) / 2), 2)
    ))
  limit 1;
$$;

revoke all on function public.find_nearest_municipio(double precision, double precision) from public;
grant execute on function public.find_nearest_municipio(double precision, double precision) to authenticated;

alter table public.drivers
  add column if not exists municipio_activo text;

update public.drivers
set municipio_activo = coalesce(municipio_activo, municipio_base)
where municipio_activo is null
  and municipio_base is not null;

revoke insert on public.drivers from public, anon, authenticated;
grant insert (
  id,
  license_number,
  municipio_base,
  is_online,
  current_lat,
  current_lng,
  updated_at
)
on public.drivers to authenticated;

drop policy if exists "authenticated_drivers_insert_pending_record" on public.drivers;
create policy "authenticated_drivers_insert_pending_record"
on public.drivers
for insert
to authenticated
with check (
  auth.uid() = id
  and status = 'pendiente'::public.driver_status
  and is_online = false
  and municipio_base is not null
  and exists (
    select 1
    from public.municipios
    where nombre = municipio_base
  )
);

create or replace function public.set_driver_base_municipio(p_municipio text)
returns setof public.drivers
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.municipios where nombre = p_municipio) then
    raise exception 'Municipio base inválido' using errcode = '22023';
  end if;

  return query
  update public.drivers
  set municipio_base = p_municipio,
      municipio_activo = coalesce(municipio_activo, p_municipio),
      municipios_activos = array[p_municipio]::text[]
  where id = auth.uid()
    and municipio_base is null
  returning *;

  if not found then
    raise exception 'El municipio base ya fue establecido o no existe el perfil de conductor'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.set_driver_active_municipio(p_municipio text)
returns setof public.drivers
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.municipios where nombre = p_municipio) then
    raise exception 'Municipio activo inválido' using errcode = '22023';
  end if;

  return query
  update public.drivers
  set municipio_activo = p_municipio,
      municipios_activos = array[p_municipio]::text[]
  where id = auth.uid();

  if not found then
    raise exception 'No encontramos tu perfil de conductor' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.set_driver_base_municipio(text) from public;
revoke all on function public.set_driver_active_municipio(text) from public;
grant execute on function public.set_driver_base_municipio(text) to authenticated;
grant execute on function public.set_driver_active_municipio(text) to authenticated;

alter table public.trips
  add column if not exists municipio_origen text,
  add column if not exists municipio_destino text;

create or replace function public.assign_trip_municipios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pickup_lat is not null and new.pickup_lng is not null then
    new.municipio_origen := public.find_nearest_municipio(new.pickup_lat, new.pickup_lng);
    -- Compatibilidad con el campo antiguo usado por versiones previas.
    new.municipio := new.municipio_origen;
  end if;

  if new.dropoff_lat is not null and new.dropoff_lng is not null then
    new.municipio_destino := public.find_nearest_municipio(new.dropoff_lat, new.dropoff_lng);
  end if;

  return new;
end;
$$;

drop trigger if exists trips_assign_municipios on public.trips;
create trigger trips_assign_municipios
before insert or update of pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
on public.trips
for each row
execute function public.assign_trip_municipios();

update public.trips
set municipio_origen = coalesce(
      municipio_origen,
      municipio,
      case
        when pickup_lat is not null and pickup_lng is not null
          then public.find_nearest_municipio(pickup_lat, pickup_lng)
      end
    )
where municipio_origen is null;

update public.trips
set municipio = municipio_origen
where municipio is null
  and municipio_origen is not null;

-- Todos los viajes abiertos están disponibles para cualquier conductor aprobado
-- y conectado. La preferencia de pueblo solo cambia el orden visual.
drop policy if exists "approved_online_drivers_can_view_open_trips" on public.trips;
drop policy if exists "approved_online_drivers_read_open_trips" on public.trips;
drop policy if exists "approved_online_drivers_can_view_all_open_trips" on public.trips;
create policy "approved_online_drivers_can_view_all_open_trips"
on public.trips
for select
to authenticated
using (
  status = 'buscando_conductor'::public.trip_status
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

create or replace function public.complete_trip(p_trip_id uuid)
returns setof public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_trip public.trips;
  driver_lat double precision;
  driver_lng double precision;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select current_lat, current_lng
  into driver_lat, driver_lng
  from public.drivers
  where id = auth.uid();

  update public.trips
  set status = 'completado'::public.trip_status,
      completed_at = clock_timestamp(),
      municipio_origen = coalesce(
        municipio_origen,
        case
          when pickup_lat is not null and pickup_lng is not null
            then public.find_nearest_municipio(pickup_lat, pickup_lng)
        end
      ),
      municipio_destino = coalesce(
        case
          when dropoff_lat is not null and dropoff_lng is not null
            then public.find_nearest_municipio(dropoff_lat, dropoff_lng)
        end,
        case
          when driver_lat is not null and driver_lng is not null
            then public.find_nearest_municipio(driver_lat, driver_lng)
        end
      )
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

revoke all on function public.complete_trip(uuid) from public;
grant execute on function public.complete_trip(uuid) to authenticated;

-- El municipio protegido no puede entrar en el INSERT del cliente.
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

create or replace function public.is_phone_available(p_phone text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select nullif(trim(p_phone), '') is null
    or not exists (
      select 1
      from public.profiles
      where phone = trim(p_phone)
    );
$$;

revoke all on function public.is_phone_available(text) from public;
grant execute on function public.is_phone_available(text) to anon, authenticated;