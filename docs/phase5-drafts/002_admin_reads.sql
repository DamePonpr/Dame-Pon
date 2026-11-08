-- BORRADOR, no automático. Requiere 001; ninguna lectura amplía RLS de drivers.
begin;
create function public.admin_console_row(p_section text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 perform public.admin_console_assert();
 case p_section
 when 'drivers' then
  select jsonb_build_object('id',d.id,'title',left(coalesce(p.full_name,'Conductor'),120),'status',d.approval_status,
   'revision',d.admin_revision,'secondary',left(coalesce(d.municipio_base,'Sin municipio'),120),
   'metadata',jsonb_strip_nulls(jsonb_build_object('estado heredado',d.status::text,'notas de revisión',left(d.review_notes,4000))))
  into r from public.drivers d join public.profiles p on p.id=d.id where d.id=p_id;
 when 'vehicles' then
  select jsonb_build_object('id',v.id,'title',left(coalesce(v.make,'Marca no registrada'),80)||' '||left(coalesce(v.model,'Modelo no registrado'),80),'status',v.status,'revision',v.admin_revision,
   'secondary',coalesce(v.plate,''),'metadata',jsonb_strip_nulls(jsonb_build_object(
    'categoría',v.vehicle_type::text,'año',v.year::text,'color',v.color))) into r from public.vehicles v where v.id=p_id;
 when 'incidents' then
  select jsonb_build_object('id',id,'title',category::text,'status',status,'revision',admin_revision,
   'secondary',severity::text,'assigneeId',assignee_id,
   'metadata',jsonb_strip_nulls(jsonb_build_object('descripción',left(description,4000),'resolución',left(resolution_notes,4000))))
  into r from public.incidents where id=p_id;
 when 'support' then
  select jsonb_build_object('id',id,'title',left(subject,200),'status',status,'revision',admin_revision,
   'secondary',priority::text,'assigneeId',assignee_id,
   'metadata',jsonb_build_object('último mensaje',last_message_at::text)) into r from public.support_cases where id=p_id;
 when 'trips' then
  select jsonb_build_object('id',id,'title','Viaje '||left(id::text,8),'status',status,'revision',0,
   'secondary',coalesce(municipio_origen,'Sin municipio')||' → '||coalesce(municipio_destino,'Sin municipio'),
   'metadata',jsonb_strip_nulls(jsonb_build_object('solicitado',requested_at::text,'completado',completed_at::text,
     'importe registrado USD',coalesce(fare_final,fare_estimate)::text)))
  into r from public.trips where id=p_id;
 when 'pricing' then
  select jsonb_build_object('id',id,'title',nombre,'status','legacy_no_aprobada','revision',0,
   'secondary','Solo lectura; no constituye aprobación comercial',
   'metadata',jsonb_build_object('origen','fare_rules legacy','base centavos',base_cents::text,
    'por km centavos',per_km_cents::text,'por minuto centavos',per_min_cents::text,
    'mínimo centavos',minimum_cents::text,'nocturno porcentaje',night_surcharge_pct::text))
  into r from public.fare_rules where id=p_id;
  if r is null and to_regclass('public.commercial_fare_versions') is not null then
   execute $q$select jsonb_build_object('id',id,'title','Versión comercial USD','status',
    case when commercial_approved then 'versión_aprobada' else 'sin_aprobación' end,
    'revision',0,'secondary','Solo lectura; no activa cotizaciones',
    'metadata',jsonb_build_object('desde',active_from::text,'hasta',active_to::text))
    from public.commercial_fare_versions where id=$1$q$ into r using p_id;
  end if;
  if r is null and to_regclass('public.ride_quotes') is not null then
   execute $q$select jsonb_build_object('id',id,'title','Cotización USD','status',
    case when trip_id is not null then 'utilizada' when expires_at<=clock_timestamp() then 'vencida' else 'vigente' end,
    'revision',0,'metadata',jsonb_build_object('total centavos',total_cents::text,'vence',expires_at::text,
      'versión',rule_version_id::text)) from public.ride_quotes where id=$1$q$ into r using p_id;
  end if;
 else raise exception 'invalid_section' using errcode='22023';
 end case;
 if r is null then raise exception 'not_found' using errcode='P0001';end if;
 return r;
end $$;
create function public.admin_console_list(p_section text,p_offset integer default 0,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source text; ids uuid[]; x uuid; result jsonb:='[]'; total bigint;
begin
 perform public.admin_console_assert();
 if p_offset<0 or p_offset>100000 or p_limit<1 or p_limit>100 or p_offset is null or p_limit is null then raise exception 'invalid_page';end if;
 source:=case p_section when 'drivers' then 'public.drivers' when 'vehicles' then 'public.vehicles'
  when 'incidents' then 'public.incidents' when 'support' then 'public.support_cases'
  when 'trips' then 'public.trips' when 'pricing' then 'public.fare_rules' else null end;
 if source is null then raise exception 'invalid_section' using errcode='22023';end if;
 source:='select id,'||case when p_section='drivers' then
   'case when approval_status::text in (''pending_documents'',''pending_review'') then 0 else 1 end'
   else '0' end||' priority from '||source;
 if p_section='pricing' then
  if to_regclass('public.commercial_fare_versions') is not null then source:=source||' union all select id,0 from public.commercial_fare_versions';end if;
  if to_regclass('public.ride_quotes') is not null then source:=source||' union all select id,0 from public.ride_quotes';end if;
 end if;
 execute 'select count(*) from ('||source||') s' into total;
 execute 'select array_agg(id) from (select id from ('||source||') base order by priority,id offset $1 limit $2) s' into ids using p_offset,p_limit;
 foreach x in array coalesce(ids,'{}'::uuid[]) loop result:=result||jsonb_build_array(public.admin_console_row(p_section,x));end loop;
 return jsonb_build_object('items',result,'total',total,'offset',p_offset,'limit',p_limit);
end $$;
create function public.admin_console_detail(p_section text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; docs jsonb:='[]'; events jsonb; doc_ids uuid[]:='{}';
begin
 perform public.admin_console_assert();
 r:=public.admin_console_row(p_section,p_id);
 if p_section='drivers' then
  select coalesce(jsonb_agg(d),'[]') into docs from (
   select jsonb_build_object('id',id,'kind','driver','type',doc_type,'status',status,'revision',admin_revision,'expiresOn',expires_on) d
    from public.driver_documents where driver_id=p_id
   union all
   select jsonb_build_object('id',vd.id,'kind','vehicle','type',doc_type,'status',vd.status,'revision',vd.admin_revision,'expiresOn',expires_on)
    from public.vehicle_documents vd join public.vehicles v on v.id=vd.vehicle_id where v.driver_id=p_id
  ) s;
 elsif p_section='vehicles' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind','vehicle','type',doc_type,'status',status,'revision',admin_revision,'expiresOn',expires_on)),'[]')
   into docs from public.vehicle_documents where vehicle_id=p_id;
 end if;
 select coalesce(array_agg((d->>'id')::uuid),'{}') into doc_ids from jsonb_array_elements(docs) d;
 select coalesce(jsonb_agg(e),'[]') into events from (
  select jsonb_build_object('id',id,'actorId',actor_id,'action',action,'reason',reason,'createdAt',created_at,
   'fromStatus',coalesce(from_status,''),'toStatus',coalesce(to_status,'')) e from public.admin_console_audit
  where (section=p_section and record_id=p_id) or (section='documents' and record_id=any(doc_ids))
  order by created_at desc limit 100
 ) s;
 return jsonb_build_object('record',r,'documents',docs,'events',events);
end $$;
revoke all on function public.admin_console_row(text,uuid),public.admin_console_list(text,integer,integer),public.admin_console_detail(text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.admin_console_list(text,integer,integer),public.admin_console_detail(text,uuid) to authenticated;
commit;
