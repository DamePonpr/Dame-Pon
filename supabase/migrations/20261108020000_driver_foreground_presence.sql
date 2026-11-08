-- Additive: no coordinates are fabricated or backfilled for existing drivers.
alter table public.drivers add column if not exists location_updated_at timestamptz;

create or replace function public.publish_driver_presence(
  p_online boolean,
  p_start boolean default false,
  p_lat double precision default null,
  p_lng double precision default null,
  p_observed_at timestamptz default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_driver public.drivers%rowtype;
begin
  if p_online is null or p_start is null then
    raise exception 'Estado de presencia inválido' using errcode = '22023';
  end if;
  if v_uid is null or not exists (
    select 1 from public.profiles where id = v_uid and role = 'conductor'
  ) then
    raise exception 'Solo un conductor autenticado puede publicar su ubicación' using errcode = '42501';
  end if;
  select * into v_driver from public.drivers where id = v_uid for update;
  if not found then
    if not p_online then return; end if;
    raise exception 'Completa tu registro de conductor' using errcode = '42501';
  end if;
  if not p_online then
    update public.drivers set is_online = false, status_kind = 'offline', updated_at = v_now where id = v_uid;
    return;
  end if;
  if v_driver.approval_status <> 'approved' then
    raise exception 'Tu conductor debe estar aprobado antes de compartir ubicación' using errcode = '42501';
  end if;
  if p_lat is null or not (p_lat between -90 and 90)
    or p_lng is null or not (p_lng between -180 and 180)
    or p_observed_at is null
    or p_observed_at < v_now - interval '20 seconds'
    or p_observed_at > v_now + interval '10 seconds' then
    raise exception 'Coordenadas GPS inválidas o antiguas' using errcode = '22023';
  end if;
  -- An update already queued before Stop must never turn an offline driver on.
  if not p_start and not v_driver.is_online then
    raise exception 'Vuelve a activar Disponible para compartir ubicación' using errcode = '42501';
  end if;
  if not p_start and v_driver.location_updated_at > v_now - interval '8 seconds' then return; end if;
  update public.drivers
    set current_lat = p_lat, current_lng = p_lng,
        location_updated_at = v_now, updated_at = v_now, is_online = true,
        status_kind = case when exists (
          select 1 from public.trips where driver_id = v_uid and status::text in ('accepted','arrived','in_progress')
        ) then 'on_trip'::public.driver_status_kind else 'online'::public.driver_status_kind end
    where id = v_uid;
end;
$$;
revoke all on function public.publish_driver_presence(boolean,boolean,double precision,double precision,timestamptz) from public, anon;
grant execute on function public.publish_driver_presence(boolean,boolean,double precision,double precision,timestamptz) to authenticated;

-- The old helper checked only the legacy enum labels aceptado/en_curso.
-- Keep legacy compatibility while restricting modern reads to assigned active trips.
create or replace function public.is_active_trip_passenger_for_driver(p_driver_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.trips
    where driver_id = p_driver_id and passenger_id = (select auth.uid())
      and status::text in ('accepted','arrived','in_progress','aceptado','en_curso')
      and exists (
        select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'pasajero'
      )
  );
$$;

create or replace function public.get_assigned_driver_location(p_trip_id uuid)
returns table (
  driver_id uuid, latitude double precision, longitude double precision,
  location_updated_at timestamptz, is_online boolean
)
language sql stable security definer set search_path = ''
as $$
  select d.id, d.current_lat, d.current_lng, d.location_updated_at, d.is_online
  from public.trips t join public.drivers d on d.id = t.driver_id
  where t.id = p_trip_id and t.passenger_id = (select auth.uid())
    and t.status::text in ('accepted','arrived','in_progress')
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'pasajero');
$$;
revoke all on function public.get_assigned_driver_location(uuid) from public, anon;
grant execute on function public.get_assigned_driver_location(uuid) to authenticated;

-- Timestamp is server-managed even though legacy safe-runtime column grants remain.
revoke update (location_updated_at), insert (location_updated_at) on public.drivers from anon, authenticated;
-- Existing table-level UPDATE/INSERT grants would override column restrictions.
-- A trigger enforces server ownership without removing legacy client privileges.
create or replace function public.guard_driver_location_timestamp()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op = 'INSERT' then
      if new.location_updated_at is not null then
        raise exception 'La marca de ubicación solo se escribe mediante la función GPS' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.location_updated_at is distinct from old.location_updated_at then
        raise exception 'La marca de ubicación solo se escribe mediante la función GPS' using errcode = '42501';
      end if;
      if new.current_lat is distinct from old.current_lat or new.current_lng is distinct from old.current_lng then
        -- Legacy updates cannot make a new location look server-confirmed.
        new.location_updated_at := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_driver_location_timestamp() from public, anon, authenticated;
create trigger guard_driver_location_timestamp
before insert or update on public.drivers
for each row execute function public.guard_driver_location_timestamp();

-- A legacy driver row must not let a current passenger write GPS through REST.
-- Existing conductor rows/documents are preserved; approval rules remain intact.
alter policy authenticated_drivers_update_safe_runtime_fields on public.drivers
using (
  id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'conductor')
)
with check (
  id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'conductor')
  and (approval_status = 'approved' or is_online = false)
);

alter policy authenticated_drivers_insert_pending_record on public.drivers
with check (
  id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'conductor')
  and approval_status = 'pending_documents' and status = 'pendiente' and is_online = false
  and municipio_base is not null
  and exists (select 1 from public.municipios m where m.nombre = drivers.municipio_base)
);

-- Presence is a short lease, not an indefinitely trusted is_online bit.
-- No cron or fabricated background heartbeat is needed to expire a dead client.
alter policy approved_online_drivers_read_openride_requests on public.trips
using (
  status::text in ('requested','offered')
  and exists (
    select 1 from public.profiles p join public.drivers d on d.id = p.id
    where p.id = (select auth.uid()) and p.role = 'conductor'
      and d.approval_status = 'approved' and d.status_kind = 'online' and d.is_online
      and d.location_updated_at > now() - interval '45 seconds'
  )
);

create or replace function public.require_fresh_driver_on_accept()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status::text = 'accepted' and old.status::text in ('requested','offered') then
    if not exists (
      select 1 from public.drivers d join public.profiles p on p.id = d.id
      where d.id = new.driver_id and p.role = 'conductor'
        and d.approval_status = 'approved' and d.is_online and d.status_kind = 'online'
        and d.location_updated_at > clock_timestamp() - interval '45 seconds'
    ) then
      raise exception 'El conductor necesita GPS reciente y disponibilidad activa para aceptar'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.require_fresh_driver_on_accept() from public, anon, authenticated;
create trigger require_fresh_driver_on_accept
before update of status, driver_id on public.trips
for each row execute function public.require_fresh_driver_on_accept();
