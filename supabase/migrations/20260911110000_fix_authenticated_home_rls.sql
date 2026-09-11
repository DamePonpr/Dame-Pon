-- Keep the mobile home screen usable without exposing personal records.
-- Every policy below is limited to authenticated users and auth.uid().

-- Profiles: a user may read and update only their own profile.
drop policy if exists "Perfiles visibles para su dueño y admins"
on public.profiles;

drop policy if exists "Usuario crea su propio perfil"
on public.profiles;

drop policy if exists "Usuario actualiza su propio perfil"
on public.profiles;

create policy "authenticated_users_read_own_profile"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or is_admin()
);

create policy "authenticated_users_insert_own_profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "authenticated_users_update_own_profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Drivers: drivers can manage their own setup and location.
drop policy if exists "Conductor actualiza su propio registro"
on public.drivers;

drop policy if exists "Conductor crea su propio registro"
on public.drivers;

drop policy if exists "Conductor ve su propio registro"
on public.drivers;

create policy "authenticated_drivers_read_own_record"
on public.drivers
for select
to authenticated
using (auth.uid() = id);

create policy "authenticated_drivers_insert_own_record"
on public.drivers
for insert
to authenticated
with check (auth.uid() = id);

create policy "authenticated_drivers_update_own_record"
on public.drivers
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Vehicles: this was the missing policy behind the driver's home-screen error.
create policy "authenticated_drivers_read_own_vehicles"
on public.vehicles
for select
to authenticated
using (auth.uid() = driver_id);

create policy "authenticated_drivers_insert_own_vehicles"
on public.vehicles
for insert
to authenticated
with check (auth.uid() = driver_id);

create policy "authenticated_drivers_update_own_vehicles"
on public.vehicles
for update
to authenticated
using (auth.uid() = driver_id)
with check (auth.uid() = driver_id);

-- Trips: participants can see and update their shared trip only.
drop policy if exists "Conductor o pasajero actualizan su viaje"
on public.trips;

drop policy if exists "Pasajero crea su propio viaje"
on public.trips;

drop policy if exists "Pasajero o conductor ven sus propios viajes"
on public.trips;

drop policy if exists "approved_online_drivers_can_view_open_trips"
on public.trips;

create policy "authenticated_participants_read_shared_trips"
on public.trips
for select
to authenticated
using (
  auth.uid() = passenger_id
  or auth.uid() = driver_id
  or is_admin()
);

create policy "authenticated_passengers_insert_own_trips"
on public.trips
for insert
to authenticated
with check (auth.uid() = passenger_id);

create policy "authenticated_participants_update_shared_trips"
on public.trips
for update
to authenticated
using (
  auth.uid() = passenger_id
  or auth.uid() = driver_id
  or is_admin()
)
with check (
  auth.uid() = passenger_id
  or auth.uid() = driver_id
  or is_admin()
);

create policy "approved_online_drivers_read_open_trips"
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

-- New accounts get a profile before the first app session is loaded.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    case
      when new.raw_user_meta_data ->> 'role' in ('driver', 'conductor')
        then 'conductor'::public.user_role
      else 'pasajero'::public.user_role
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile
on auth.users;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();