-- PENDING / gated enforcement + transactional trip availability.
-- Both global and per-driver enforcement start OFF. No online rows are reset.
create table public.driver_gps_rollout (
  singleton boolean primary key default true check (singleton),
  enforce_fresh_gps boolean not null default false
);
insert into public.driver_gps_rollout(singleton) values (true);
create table public.driver_gps_cohorts (
  driver_id uuid primary key references public.drivers(id),
  enforce_fresh_gps boolean not null default false
);
alter table public.driver_gps_rollout enable row level security;
alter table public.driver_gps_cohorts enable row level security;
revoke all on public.driver_gps_rollout, public.driver_gps_cohorts from public, anon, authenticated;
grant select, update on public.driver_gps_rollout to service_role;
grant select, insert, update on public.driver_gps_cohorts to service_role;

create function public.driver_requires_fresh_gps(p_driver_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  -- Missing configuration must not silently disable a protection already enabled.
  select coalesce((select enforce_fresh_gps from public.driver_gps_rollout where singleton), true)
    or coalesce((select enforce_fresh_gps from public.driver_gps_cohorts where driver_id = p_driver_id), false);
$$;
revoke all on function public.driver_requires_fresh_gps(uuid) from public, anon, authenticated;

create function public.can_driver_read_open_requests()
returns boolean language sql volatile security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join public.drivers d on d.id = p.id
    where p.id = (select auth.uid()) and p.role = 'conductor'
      and d.approval_status = 'approved' and d.status_kind = 'online' and d.is_online
      and (not public.driver_requires_fresh_gps(d.id) or public.driver_presence_is_fresh(d.id))
  );
$$;
revoke all on function public.can_driver_read_open_requests() from public, anon;
grant execute on function public.can_driver_read_open_requests() to authenticated;

alter policy approved_online_drivers_read_openride_requests on public.trips
using (
  status::text in ('requested','offered')
  and (select public.can_driver_read_open_requests())
);

create function public.require_fresh_driver_on_accept()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status::text in ('accepted','aceptado')
    and (old.status is distinct from new.status or old.driver_id is distinct from new.driver_id)
    and public.driver_requires_fresh_gps(new.driver_id) then
    -- Serialize the freshness decision with GPS Stop/activation.
    perform 1 from public.drivers where id = new.driver_id for update;
    if not exists (
      select 1 from public.drivers d join public.profiles p on p.id = d.id
      where d.id = new.driver_id and p.role = 'conductor'
        and d.approval_status = 'approved' and d.is_online and d.status_kind = 'online'
        and public.driver_presence_is_fresh(d.id)
    ) then
      raise exception 'El conductor necesita GPS reciente y disponibilidad activa para aceptar'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.require_fresh_driver_on_accept() from public, anon, authenticated;
create trigger require_fresh_driver_on_accept before update of status, driver_id on public.trips
for each row execute function public.require_fresh_driver_on_accept();

-- Runs in the SAME transaction as existing accept/start/complete/cancel RPCs.
-- Never turns on an offline driver, never changes GPS date/roles/documents.
create function public.sync_driver_trip_availability()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_old uuid;
  v_id uuid;
begin
  if tg_op = 'UPDATE' then v_old := old.driver_id; end if;
  for v_id in
    select distinct id from unnest(array[v_old, new.driver_id]) id where id is not null order by id
  loop
    update public.drivers d
      set status_kind = case
        when not d.is_online then 'offline'::public.driver_status_kind
        when exists (
          select 1 from public.trips t where t.driver_id = d.id
            and t.status::text in ('accepted','arrived','in_progress','aceptado','en_curso')
        ) then 'on_trip'::public.driver_status_kind
        else 'online'::public.driver_status_kind end,
        updated_at = clock_timestamp()
      where d.id = v_id;
  end loop;
  return new;
end;
$$;
revoke all on function public.sync_driver_trip_availability() from public, anon, authenticated;
create trigger sync_driver_trip_availability after insert or update of status, driver_id on public.trips
for each row execute function public.sync_driver_trip_availability();
