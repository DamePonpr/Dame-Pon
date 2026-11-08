-- PENDING / expansion + privacy. No freshness enforcement on dispatch here.
-- No backfill: legacy online drivers keep their availability and NULL GPS date.
-- Never leave an older un-fenced overload callable alongside the new protocol.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'publish_driver_presence'
  ) then
    raise exception 'Ya existe un protocolo GPS: reconciliar sus firmas/permisos antes de aplicar esta migración';
  end if;
end;
$$;
alter table public.drivers add column if not exists location_updated_at timestamptz;

-- Private protocol state: never exposed by PostgREST or Realtime.
create table public.driver_presence_control (
  driver_id uuid primary key references public.drivers(id),
  generation bigint not null default 0,
  current_session_id uuid,
  last_opened_at timestamptz
);
create table public.driver_presence_sessions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id),
  auth_session_id text not null,
  base_generation bigint not null,
  activated boolean not null default false,
  revoked boolean not null default false,
  last_sequence bigint not null default 0,
  last_observed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.driver_presence_control enable row level security;
alter table public.driver_presence_sessions enable row level security;
revoke all on public.driver_presence_control, public.driver_presence_sessions from public, anon, authenticated;

-- Allocation is NOT activation: a cancelled/delayed allocation cannot go online.
-- UUIDs are server-generated and never reused; closing leaves a tombstone.
create function public.open_driver_presence_session()
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_session text := nullif(auth.jwt()->>'session_id', '');
  v_control public.driver_presence_control%rowtype;
  v_id uuid;
begin
  if v_uid is null or v_auth_session is null or not exists (
    select 1 from public.profiles where id = v_uid and role = 'conductor'
  ) then
    raise exception 'Se requiere una sesión autenticada de conductor' using errcode = '42501';
  end if;
  perform 1 from public.drivers where id = v_uid and approval_status = 'approved' for update;
  if not found then
    raise exception 'El conductor debe estar aprobado' using errcode = '42501';
  end if;
  insert into public.driver_presence_control(driver_id) values (v_uid) on conflict do nothing;
  select * into v_control from public.driver_presence_control where driver_id = v_uid;
  if v_control.last_opened_at > clock_timestamp() - interval '2 seconds' then
    raise exception 'Espera dos segundos antes de volver a activar el GPS' using errcode = '22023';
  end if;
  insert into public.driver_presence_sessions(driver_id, auth_session_id, base_generation)
    values (v_uid, v_auth_session, v_control.generation) returning id into v_id;
  update public.driver_presence_control set last_opened_at = clock_timestamp() where driver_id = v_uid;
  return v_id;
end;
$$;
revoke all on function public.open_driver_presence_session() from public, anon;
grant execute on function public.open_driver_presence_session() to authenticated;

create function public.publish_driver_presence(
  p_session_id uuid,
  p_sequence bigint,
  p_online boolean,
  p_lat double precision default null,
  p_lng double precision default null,
  p_observed_at timestamptz default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz;
  v_session public.driver_presence_sessions%rowtype;
  v_control public.driver_presence_control%rowtype;
  v_driver public.drivers%rowtype;
begin
  if v_uid is null or nullif(auth.jwt()->>'session_id', '') is null or not exists (
    select 1 from public.profiles where id = v_uid and role = 'conductor'
  ) then
    raise exception 'Solo un conductor autenticado puede publicar ubicación' using errcode = '42501';
  end if;
  if p_online is null or p_sequence is null or p_sequence < 1 then
    raise exception 'Secuencia o estado de presencia inválido' using errcode = '22023';
  end if;
  -- All operations lock the driver FIRST, including trip transitions.
  select * into v_driver from public.drivers where id = v_uid for update;
  select * into v_session from public.driver_presence_sessions
    where id = p_session_id and driver_id = v_uid
      and auth_session_id = auth.jwt()->>'session_id' for update;
  if not found then
    raise exception 'La sesión GPS no pertenece a esta sesión de autenticación' using errcode = '42501';
  end if;
  select * into v_control from public.driver_presence_control where driver_id = v_uid;
  v_now := clock_timestamp(); -- after lock waits, not before
  if not p_online then
    -- Stop wins permanently for THIS token, even before its first publication.
    update public.driver_presence_sessions set revoked = true where id = p_session_id;
    if v_control.current_session_id = p_session_id then
      update public.driver_presence_control
        set generation = generation + 1, current_session_id = null where driver_id = v_uid;
      update public.drivers set is_online = false, status_kind = 'offline', updated_at = v_now where id = v_uid;
    end if;
    return;
  end if;
  if v_session.revoked or v_driver.approval_status <> 'approved'
    or p_sequence <= v_session.last_sequence then
    raise exception 'Sesión GPS revocada o publicación fuera de orden' using errcode = '42501';
  end if;
  if p_lat is null or not (p_lat between -90 and 90)
    or p_lng is null or not (p_lng between -180 and 180)
    or p_observed_at is null or p_observed_at < v_now - interval '20 seconds'
    or p_observed_at > v_now + interval '10 seconds'
    or p_observed_at < v_session.last_observed_at then
    raise exception 'Coordenadas GPS inválidas, antiguas o fuera de orden' using errcode = '22023';
  end if;
  if not v_session.activated then
    -- Compare-and-swap: an older allocation cannot replace a newer generation.
    if v_control.generation <> v_session.base_generation then
      raise exception 'Otra sesión tomó el control del GPS; vuelve a activar Disponible' using errcode = '42501';
    end if;
    update public.driver_presence_control
      set generation = generation + 1, current_session_id = p_session_id where driver_id = v_uid;
    update public.driver_presence_sessions set activated = true where id = p_session_id;
  elsif v_control.current_session_id is distinct from p_session_id or not v_driver.is_online then
    raise exception 'Esta sesión GPS ya no controla la disponibilidad' using errcode = '42501';
  end if;
  -- Advancing the sequence even for throttled samples fences delayed packets.
  update public.driver_presence_sessions
    set last_sequence = p_sequence, last_observed_at = p_observed_at where id = p_session_id;
  if v_session.activated and v_driver.location_updated_at > v_now - interval '8 seconds' then return; end if;
  update public.drivers
    set current_lat = p_lat, current_lng = p_lng,
        location_updated_at = v_now, updated_at = v_now, is_online = true,
        status_kind = case when exists (
          select 1 from public.trips where driver_id = v_uid
            and status::text in ('accepted','arrived','in_progress','aceptado','en_curso')
        ) then 'on_trip'::public.driver_status_kind else 'online'::public.driver_status_kind end
    where id = v_uid;
end;
$$;
revoke all on function public.publish_driver_presence(uuid,bigint,boolean,double precision,double precision,timestamptz) from public, anon;
grant execute on function public.publish_driver_presence(uuid,bigint,boolean,double precision,double precision,timestamptz) to authenticated;

-- Internal only: no endpoint to enumerate arbitrary driver presence.
create function public.driver_presence_is_fresh(p_driver_id uuid)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select exists (
    select 1 from public.drivers d
    join public.driver_presence_control c on c.driver_id = d.id
    join public.driver_presence_sessions s on s.id = c.current_session_id and s.driver_id = d.id
    where d.id = p_driver_id and d.is_online and d.approval_status = 'approved'
      and s.activated and not s.revoked
      and d.location_updated_at > clock_timestamp() - interval '45 seconds'
      and d.location_updated_at <= clock_timestamp()
      and s.last_observed_at > clock_timestamp() - interval '45 seconds'
  );
$$;
revoke all on function public.driver_presence_is_fresh(uuid) from public, anon, authenticated;

-- Edge service only. No legacy is_online-only push and no public enumeration.
create function public.get_fresh_driver_push_targets()
returns table (id uuid, current_lat double precision, current_lng double precision)
language sql volatile security definer set search_path = ''
as $$
  select d.id, d.current_lat, d.current_lng from public.drivers d
  join public.profiles p on p.id = d.id and p.role = 'conductor'
  join public.driver_presence_control c on c.driver_id = d.id
  join public.driver_presence_sessions s on s.id = c.current_session_id and s.driver_id = d.id
  where d.approval_status = 'approved' and d.status_kind = 'online' and d.is_online
    and s.activated and not s.revoked
    and d.location_updated_at > clock_timestamp() - interval '45 seconds'
    and d.location_updated_at <= clock_timestamp()
    and s.last_observed_at > clock_timestamp() - interval '45 seconds'
    and d.current_lat between -90 and 90 and d.current_lng between -180 and 180;
$$;
revoke all on function public.get_fresh_driver_push_targets() from public, anon, authenticated;
grant execute on function public.get_fresh_driver_push_targets() to service_role;

create function public.get_assigned_driver_location(p_trip_id uuid)
returns table (
  driver_id uuid, latitude double precision, longitude double precision,
  location_updated_at timestamptz, is_online boolean
)
language sql stable security definer set search_path = ''
as $$
  -- Materialize ONE snapshot/predicate for both coordinates: never combine
  -- coordinates from one row version with freshness read from another version.
  with assigned as materialized (
    select d.id, d.current_lat, d.current_lng,
      least(d.location_updated_at, s.last_observed_at) as location_updated_at, d.is_online,
      coalesce(d.is_online and d.approval_status = 'approved' and s.activated and not s.revoked
        and d.location_updated_at > clock_timestamp() - interval '45 seconds'
        and d.location_updated_at <= clock_timestamp()
        and s.last_observed_at > clock_timestamp() - interval '45 seconds', false) as fresh
    from public.trips t join public.drivers d on d.id = t.driver_id
    left join public.driver_presence_control c on c.driver_id = d.id
    left join public.driver_presence_sessions s on s.id = c.current_session_id and s.driver_id = d.id
    where t.id = p_trip_id and t.passenger_id = (select auth.uid())
      and t.status::text in ('accepted','arrived','in_progress','aceptado','en_curso')
      and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'pasajero')
  )
  select id, case when fresh then current_lat else null end,
    case when fresh then current_lng else null end, location_updated_at, is_online from assigned;
$$;
revoke all on function public.get_assigned_driver_location(uuid) from public, anon;
grant execute on function public.get_assigned_driver_location(uuid) to authenticated;

-- RLS is ROW-level: never grant passengers SELECT on the private driver row.
-- Own-driver SELECT remains unchanged; passenger presence uses the minimal RPC.
drop policy if exists assigned_passenger_can_view_driver_location on public.drivers;

-- Do not broadcast private driver rows (including DELETE/old replica images).
-- Fail closed if this publication uses ALL TABLES or a whole-schema publication:
-- removing a direct table membership would not protect rows in those cases.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables)
    or exists (
      select 1 from pg_publication_namespace pn join pg_publication p on p.oid = pn.pnpubid
      join pg_namespace n on n.oid = pn.pnnspid
      where p.pubname = 'supabase_realtime' and n.nspname = 'public'
    ) then
    raise exception 'La publicación Realtime debe usar tablas explícitas antes de proteger drivers';
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'drivers'
  ) then
    alter publication supabase_realtime drop table public.drivers;
  end if;
end;
$$;

create function public.guard_driver_location_timestamp()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op = 'INSERT' then
      if new.location_updated_at is not null then
        raise exception 'Fecha GPS administrada por el servidor' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.location_updated_at is distinct from old.location_updated_at then
        raise exception 'Fecha GPS administrada por el servidor' using errcode = '42501';
      end if;
      if new.current_lat is distinct from old.current_lat or new.current_lng is distinct from old.current_lng
        or new.is_online is distinct from old.is_online then
        new.location_updated_at := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_driver_location_timestamp() from public, anon, authenticated;
create trigger guard_driver_location_timestamp before insert or update on public.drivers
for each row execute function public.guard_driver_location_timestamp();

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
