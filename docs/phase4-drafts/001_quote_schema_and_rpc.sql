-- BORRADOR NO APLICADO. ONLY disposable LOCAL fixtures may execute this file.
-- OUTSIDE supabase/migrations intentionally. No seed prices, no payment writes.
-- Requires existing profiles/municipios/trips/is_admin, modern trip lifecycle RPCs.
create table public.quote_rollout (
  singleton boolean primary key default true check(singleton),
  require_quotes boolean not null default false
);
insert into public.quote_rollout values(true,false);
revoke all on public.quote_rollout from public,anon,authenticated,service_role;
alter table public.quote_rollout enable row level security;
create table public.quote_enforcement_cohorts (
  passenger_id uuid primary key references public.profiles(id),
  enrolled_by uuid not null references public.profiles(id),
  reason text not null check(length(btrim(reason))>=10),
  enrolled_at timestamptz not null default clock_timestamp()
);
revoke all on public.quote_enforcement_cohorts from public,anon,authenticated,service_role;
alter table public.quote_enforcement_cohorts enable row level security;

create table public.commercial_fare_versions (
  id uuid primary key default gen_random_uuid(),
  municipio_id text references public.municipios(id),
  vehicle_type text not null check(vehicle_type='sedan'),
  commercial_approved boolean not null check(commercial_approved),
  currency text not null check(currency='USD'),
  algorithm text not null check(algorithm='fixed-route-v1'),
  minimum_policy text not null check(minimum_policy='floor_total'),
  night_policy text not null check(night_policy='explicitly_not_applicable'),
  base_cents integer not null check(base_cents>=0),
  per_km_cents integer not null check(per_km_cents>=0),
  per_min_cents integer not null check(per_min_cents>=0),
  minimum_cents integer not null check(minimum_cents>=0),
  active_from timestamptz not null,
  active_to timestamptz not null check(active_to>active_from),
  approved_by uuid not null references public.profiles(id),
  approval_reason text not null check(length(btrim(approval_reason))>=10),
  approved_at timestamptz not null default clock_timestamp()
);
-- Separate approved boundary versions: never use nearest-centroid as jurisdiction.
create table public.quote_area_versions (
  id uuid primary key default gen_random_uuid(),
  municipio_id text not null references public.municipios(id),
  geometry jsonb not null check(geometry->>'type' in ('Polygon','MultiPolygon')),
  active_from timestamptz not null,
  active_to timestamptz not null check(active_to>active_from),
  approved_by uuid not null references public.profiles(id),
  approval_reason text not null check(length(btrim(approval_reason))>=10),
  approved_at timestamptz not null default clock_timestamp()
);
create table public.ride_quotes (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id),
  rule_version_id uuid not null references public.commercial_fare_versions(id),
  origin_area_id uuid not null references public.quote_area_versions(id),
  destination_area_id uuid not null references public.quote_area_versions(id),
  origin jsonb not null, destination jsonb not null,
  vehicle_type text not null check(vehicle_type='sedan'),
  currency text not null check(currency='USD'),
  policy_version text not null check(policy_version='fixed-route-v1'),
  distance_mm bigint not null check(distance_mm between 1 and 700000000),
  duration_ms bigint not null check(duration_ms between 1 and 86400000),
  route_hash text not null check(route_hash ~ '^[a-f0-9]{64}$'),
  total_cents integer not null check(total_cents between 0 and 99999999),
  breakdown jsonb not null, rule_snapshot jsonb not null,
  created_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>created_at),
  trip_id uuid unique references public.trips(id) deferrable initially deferred,
  confirmation_key uuid,
  unique(passenger_id,confirmation_key),
  check((trip_id is null)=(confirmation_key is null))
);
alter table public.trips add column quote_id uuid unique references public.ride_quotes(id);
revoke all on public.commercial_fare_versions,public.quote_area_versions,public.ride_quotes
  from public,anon,authenticated,service_role;
alter table public.commercial_fare_versions enable row level security;
alter table public.quote_area_versions enable row level security;
alter table public.ride_quotes enable row level security;
grant select(id,passenger_id,origin,destination,vehicle_type,currency,policy_version,
  distance_mm,duration_ms,total_cents,breakdown,expires_at,created_at,rule_version_id,trip_id)
  on public.ride_quotes to authenticated;
create policy quotes_own_read on public.ride_quotes for select to authenticated
  using(passenger_id=auth.uid());

create function public.quote_immutable_version() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_commercial_version' using errcode='42501'; end;
$$;
create trigger fare_immutable before update or delete on public.commercial_fare_versions
  for each row execute function public.quote_immutable_version();
create trigger area_immutable before update or delete on public.quote_area_versions
  for each row execute function public.quote_immutable_version();
create function public.quote_immutable_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'immutable_quote' using errcode='42501'; end if;
  if (to_jsonb(new)-'trip_id'-'confirmation_key') is distinct from (to_jsonb(old)-'trip_id'-'confirmation_key')
    or old.trip_id is not null then raise exception 'immutable_quote' using errcode='42501'; end if;
  return new;
end; $$;
create trigger quote_immutable before update or delete on public.ride_quotes
  for each row execute function public.quote_immutable_snapshot();

create function public.quote_dto(q public.ride_quotes) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',q.id,'origin',q.origin,'destination',q.destination,
    'vehicleType',q.vehicle_type,'currency',q.currency,'policyVersion',q.policy_version,
    'totalCents',q.total_cents,'distanceMm',q.distance_mm,'durationMs',q.duration_ms,
    'expiresAt',q.expires_at,'serverTime',clock_timestamp(),'ruleVersionId',q.rule_version_id,'breakdown',q.breakdown)
$$;
create function public.quote_server_context(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor and role::text='pasajero')
    then raise exception 'quote_forbidden' using errcode='42501'; end if;
  if not (select require_quotes from public.quote_rollout)
    or not exists(select 1 from public.quote_enforcement_cohorts where passenger_id=p_actor)
    then return '{"enabled":false}'::jsonb; end if;
  return jsonb_build_object('enabled',true,
    'areas',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('nombre',m.nombre)),'[]'::jsonb)
      from public.quote_area_versions a join public.municipios m on m.id=a.municipio_id
      where clock_timestamp()>=a.active_from and clock_timestamp()<a.active_to),
    'rules',(select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from public.commercial_fare_versions v
      where commercial_approved and clock_timestamp()>=active_from and clock_timestamp()<active_to));
end; $$;

create function public.quote_server_store(p_actor uuid,p_input jsonb,p_rule uuid,
  p_origin_area uuid,p_destination_area uuid,p_distance_mm bigint,p_duration_ms bigint,
  p_route_hash text,p_expected_cents integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  r public.commercial_fare_versions; q public.ride_quotes; raw numeric; floor_n numeric;
  total integer; dist numeric; tim numeric; point jsonb; issued timestamptz:=clock_timestamp();
begin
  if not ((public.quote_server_context(p_actor)->>'enabled')::boolean)
    then raise exception 'quotes_unavailable' using errcode='42501'; end if;
  select * into strict r from public.commercial_fare_versions where id=p_rule
    and commercial_approved and issued>=active_from and issued<active_to;
  if p_input->>'vehicleType' is distinct from r.vehicle_type
    or p_distance_mm not between 1 and 700000000 or p_duration_ms not between 1 and 86400000
    or p_distance_mm is null or p_duration_ms is null then
    raise exception 'invalid_quote_inputs' using errcode='22023';
  end if;
  if (select count(*) from public.quote_area_versions where id in(p_origin_area,p_destination_area)
    and issued>=active_from and issued<active_to) <> (case when p_origin_area=p_destination_area then 1 else 2 end)
    then raise exception 'municipality_unavailable' using errcode='22023'; end if;
  if r.municipio_id is not null and r.municipio_id is distinct from
    (select municipio_id from public.quote_area_versions where id=p_origin_area)
    then raise exception 'municipality_unavailable' using errcode='22023'; end if;
  if r.municipio_id is null and exists(select 1 from public.commercial_fare_versions v
    where v.municipio_id=(select municipio_id from public.quote_area_versions where id=p_origin_area)
    and v.vehicle_type=r.vehicle_type and issued>=v.active_from and issued<v.active_to)
    then raise exception 'approved_rule_unavailable' using errcode='22023'; end if;
  foreach point in array array[p_input->'origin',p_input->'destination'] loop
    if jsonb_typeof(point) is distinct from 'object'
      or jsonb_typeof(point->'latitude') is distinct from 'number'
      or jsonb_typeof(point->'longitude') is distinct from 'number'
      or jsonb_typeof(point->'address') is distinct from 'string'
      or not ((point->>'latitude')::numeric between 17.8 and 18.6)
      or not ((point->>'longitude')::numeric between -68 and -65.1)
      or length(btrim(point->>'address')) not between 3 and 300
      then raise exception 'invalid_endpoints' using errcode='22023'; end if;
  end loop;
  dist:=r.per_km_cents::numeric*p_distance_mm; tim:=r.per_min_cents::numeric*p_duration_ms;
  raw:=r.base_cents::numeric*3000000+dist*3+tim*50; floor_n:=r.minimum_cents::numeric*3000000;
  total:=floor((greatest(raw,floor_n)+1500000)/3000000);
  if total is distinct from p_expected_cents or total not between 0 and 99999999
    then raise exception 'quote_calculation_mismatch' using errcode='22023'; end if;
  insert into public.ride_quotes(passenger_id,rule_version_id,origin_area_id,destination_area_id,
    origin,destination,vehicle_type,currency,policy_version,distance_mm,duration_ms,route_hash,
    total_cents,breakdown,rule_snapshot,created_at,expires_at)
  values(p_actor,r.id,p_origin_area,p_destination_area,p_input->'origin',p_input->'destination',
    r.vehicle_type,r.currency,r.algorithm,p_distance_mm,p_duration_ms,p_route_hash,total,
    jsonb_build_object('baseCents',r.base_cents,'distanceCents',jsonb_build_object('numerator',dist::text,'denominator',1000000),
      'timeCents',jsonb_build_object('numerator',tim::text,'denominator',60000),'minimumCents',r.minimum_cents,
      'minimumApplied',raw<floor_n,'rounding','HALF_UP_FINAL_CENT','minimumPolicy',r.minimum_policy,
      'nightPolicy',r.night_policy,'totalCents',total),to_jsonb(r),issued,issued+interval '5 minutes')
  returning * into q;
  return public.quote_dto(q);
end; $$;

-- Applies also to legacy REST insert: gate OFF preserves current unpriced flow.
-- Consumed trip_id is reserved inside the private RPC before INSERT; cannot be
-- forged by authenticated clients that have no UPDATE on quotes.
create function public.quote_trip_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
declare q public.ride_quotes;
begin
  if tg_op='UPDATE' and old.quote_id is not null and new.quote_id is distinct from old.quote_id
    then raise exception 'immutable_trip_quote' using errcode='42501'; end if;
  if new.quote_id is null then
    if tg_op='INSERT' and (select require_quotes from public.quote_rollout)
      and exists(select 1 from public.quote_enforcement_cohorts where passenger_id=new.passenger_id)
      then raise exception 'quote_required' using errcode='42501'; end if;
    return new;
  end if;
  select * into strict q from public.ride_quotes where id=new.quote_id;
  if q.trip_id is distinct from new.id or q.passenger_id is distinct from new.passenger_id
    or new.pickup_lat is distinct from (q.origin->>'latitude')::double precision
    or new.pickup_lng is distinct from (q.origin->>'longitude')::double precision
    or new.dropoff_lat is distinct from (q.destination->>'latitude')::double precision
    or new.dropoff_lng is distinct from (q.destination->>'longitude')::double precision
    or new.pickup_address is distinct from q.origin->>'address'
    or new.dropoff_address is distinct from q.destination->>'address'
    or new.fare_estimate is distinct from q.total_cents::numeric/100
    then raise exception 'immutable_trip_quote' using errcode='42501'; end if;
  if new.fare_final is not null and new.fare_final is distinct from q.total_cents::numeric/100
    then raise exception 'immutable_trip_quote' using errcode='42501'; end if;
  if new.driver_id is not null and (tg_op='INSERT' or old.driver_id is distinct from new.driver_id) then
    if (select count(*) from public.vehicles where driver_id=new.driver_id and status::text='approved')<>1
      or not exists(select 1 from public.vehicles where driver_id=new.driver_id
        and status::text='approved' and vehicle_type::text=q.vehicle_type)
      then raise exception 'quoted_vehicle_required' using errcode='42501'; end if;
  end if;
  if new.status::text='completed' then new.fare_final:=q.total_cents::numeric/100; end if;
  new.distance_km:=q.distance_mm::numeric/1000000;
  select m.nombre into new.municipio_origen from public.quote_area_versions a
    join public.municipios m on m.id=a.municipio_id where a.id=q.origin_area_id;
  select m.nombre into new.municipio_destino from public.quote_area_versions a
    join public.municipios m on m.id=a.municipio_id where a.id=q.destination_area_id;
  new.municipio:=new.municipio_origen;
  return new; -- NO payment_status transition, NO payments write.
end; $$;
create trigger zz_quote_trip_integrity before insert or update on public.trips
  for each row execute function public.quote_trip_integrity();

create function public.quote_server_confirm(p_actor uuid,p_quote uuid,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.ride_quotes; prior public.ride_quotes; tid uuid:=gen_random_uuid();
begin
  if p_key is null then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_key::text,0));
  select * into prior from public.ride_quotes where passenger_id=p_actor and confirmation_key=p_key;
  if found then
    if prior.id<>p_quote then raise exception 'idempotency_conflict' using errcode='23505'; end if;
    return prior.trip_id; -- Retry after expiry returns SAME trip, never recreates.
  end if;
  select * into q from public.ride_quotes where id=p_quote for update;
  if not found or q.passenger_id<>p_actor then raise exception 'quote_forbidden' using errcode='42501'; end if;
  if q.trip_id is not null then raise exception 'quote_used' using errcode='23505'; end if;
  if q.expires_at<=clock_timestamp() then raise exception 'quote_expired' using errcode='22023'; end if;
  if not ((public.quote_server_context(p_actor)->>'enabled')::boolean)
    then raise exception 'quotes_unavailable' using errcode='42501'; end if;
  update public.ride_quotes set trip_id=tid,confirmation_key=p_key where id=q.id;
  insert into public.trips(id,passenger_id,status,passenger_pin,quote_id,
    pickup_address,pickup_lat,pickup_lng,dropoff_address,dropoff_lat,dropoff_lng,fare_estimate)
  values(tid,p_actor,'requested',lpad((floor(random()*10000))::integer::text,4,'0'),q.id,
    q.origin->>'address',(q.origin->>'latitude')::double precision,(q.origin->>'longitude')::double precision,
    q.destination->>'address',(q.destination->>'latitude')::double precision,(q.destination->>'longitude')::double precision,
    q.total_cents::numeric/100);
  return tid;
end; $$;

-- Only server-held service role may supply trusted metrics or actor identity.
revoke all on function public.quote_server_context(uuid),
  public.quote_server_store(uuid,jsonb,uuid,uuid,uuid,bigint,bigint,text,integer),
  public.quote_server_confirm(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.quote_server_context(uuid),
  public.quote_server_store(uuid,jsonb,uuid,uuid,uuid,bigint,bigint,text,integer),
  public.quote_server_confirm(uuid,uuid,uuid) to service_role;
revoke all on function public.quote_dto(public.ride_quotes),public.quote_immutable_version(),
  public.quote_immutable_snapshot(),public.quote_trip_integrity() from public,anon,authenticated,service_role;
