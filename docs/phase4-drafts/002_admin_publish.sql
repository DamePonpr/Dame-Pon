-- BORRADOR NO APLICADO. No fake admin or seed rates. Append-only approvals.
create function public.publish_commercial_fare_version(p_rule jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if jsonb_typeof(p_rule) is distinct from 'object' or exists(
    select 1 from jsonb_object_keys(p_rule) as k(key) where key not in
    ('commercialApproval','municipio_id','vehicle_type','currency','algorithm','minimum_policy',
     'night_policy','base_cents','per_km_cents','per_min_cents','minimum_cents','active_from','active_to'))
    then raise exception 'commercial_decisions_required' using errcode='22023'; end if;
  if p_rule->>'commercialApproval' is distinct from 'true'
    or p_rule->>'minimum_policy' is distinct from 'floor_total'
    or p_rule->>'night_policy' is distinct from 'explicitly_not_applicable'
    then raise exception 'commercial_decisions_required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('fare-version-publication',0));
  if exists(select 1 from public.commercial_fare_versions where municipio_id is not distinct from (p_rule->>'municipio_id')
    and vehicle_type=p_rule->>'vehicle_type' and
    tstzrange(active_from,active_to,'[)') && tstzrange((p_rule->>'active_from')::timestamptz,(p_rule->>'active_to')::timestamptz,'[)'))
    then raise exception 'overlapping_fare_version' using errcode='22023'; end if;
  insert into public.commercial_fare_versions(municipio_id,vehicle_type,commercial_approved,currency,
    algorithm,minimum_policy,night_policy,base_cents,per_km_cents,per_min_cents,minimum_cents,
    active_from,active_to,approved_by,approval_reason)
  values(p_rule->>'municipio_id',p_rule->>'vehicle_type',true,p_rule->>'currency',
    p_rule->>'algorithm',p_rule->>'minimum_policy',p_rule->>'night_policy',
    (p_rule->>'base_cents')::integer,(p_rule->>'per_km_cents')::integer,
    (p_rule->>'per_min_cents')::integer,(p_rule->>'minimum_cents')::integer,
    (p_rule->>'active_from')::timestamptz,(p_rule->>'active_to')::timestamptz,auth.uid(),p_reason)
  returning id into result;
  return result;
end; $$;
create function public.publish_quote_service_area(p_municipio text,p_geometry jsonb,
  p_from timestamptz,p_to timestamptz,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('quote-area-publication',0));
  if exists(select 1 from public.quote_area_versions where municipio_id=p_municipio and
    tstzrange(active_from,active_to,'[)') && tstzrange(p_from,p_to,'[)'))
    then raise exception 'overlapping_area_version' using errcode='22023'; end if;
  insert into public.quote_area_versions(municipio_id,geometry,active_from,active_to,approved_by,approval_reason)
    values(p_municipio,p_geometry,p_from,p_to,auth.uid(),p_reason) returning id into result;
  return result;
end; $$;
revoke all on function public.publish_commercial_fare_version(jsonb,text),
  public.publish_quote_service_area(text,jsonb,timestamptz,timestamptz,text) from public,anon,service_role;
grant execute on function public.publish_commercial_fare_version(jsonb,text),
  public.publish_quote_service_area(text,jsonb,timestamptz,timestamptz,text) to authenticated;
revoke all on function public.quote_immutable_version(),public.quote_immutable_snapshot(),
  public.quote_trip_integrity() from public,anon,authenticated,service_role;
