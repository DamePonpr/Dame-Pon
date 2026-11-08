-- BORRADOR. No roles nuevos, no tarifas, pagos ni compuertas modificadas.
begin;
create function public.admin_console_file(p_path text,p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_path is not null and length(p_path)<1000
  and split_part(p_path,'/',1)=p_owner::text
  and p_path !~ '[%?#\\]' and p_path !~ '(^|/)([.]|[.][.]|)(/|$)'
  and exists(select 1 from storage.objects where bucket_id='driver-documents' and name=p_path
   and metadata->>'mimetype' in ('image/jpeg','image/png','application/pdf'))
$$;
create function public.admin_console_document(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare doc record; owner_id uuid; target uuid; kind text; doc_path text; h text; prior public.admin_console_audit;
begin
 perform public.admin_console_assert();
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k
  where k not in ('id','kind','reason','expectedRevision','idempotencyKey'))
  or length(btrim(p_input->>'reason')) not between 10 and 1000
  or p_input->>'reason' is null then raise exception 'invalid_input';end if;
 target:=(p_input->>'id')::uuid;kind:=p_input->>'kind';
 if kind not in ('driver','vehicle') or kind is null or target is null
  or p_input->>'idempotencyKey' is null then raise exception 'invalid_input';end if;
 h:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||(p_input->>'idempotencyKey'),0));
 select * into prior from public.admin_console_audit
  where actor_id=auth.uid() and request_key=(p_input->>'idempotencyKey')::uuid;
 if found and prior.request_hash<>h then raise exception 'idempotency_conflict';end if;
 if kind='driver' then
  select storage_path,driver_id,admin_revision,status into doc from public.driver_documents where id=target for update;
  owner_id:=doc.driver_id;
 else
  select d.storage_path,d.vehicle_id,d.admin_revision,d.status into doc from public.vehicle_documents d where d.id=target for update;
  select driver_id into owner_id from public.vehicles where id=doc.vehicle_id;
 end if;
 if owner_id is null then raise exception 'not_found';end if;
 if doc.admin_revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
 doc_path:=doc.storage_path;
 if public.admin_console_file(doc_path,owner_id) is distinct from true then raise exception 'document_path_unsafe';end if;
 if prior.id is null then
  insert into public.admin_console_audit(actor_id,section,record_id,action,reason,from_status,to_status,
   request_key,request_hash,evidence_path,record_revision)
  values(auth.uid(),'documents',target,'open',btrim(p_input->>'reason'),doc.status,doc.status,
   (p_input->>'idempotencyKey')::uuid,h,doc_path,doc.admin_revision);
 end if;
 insert into public.admin_document_tickets(actor_id,path,expires_at) values(auth.uid(),doc_path,clock_timestamp()+interval '60 seconds')
  on conflict(actor_id,path) do update set expires_at=excluded.expires_at;
 return jsonb_build_object('path',doc_path);
end $$;
create function public.admin_console_packet(p_driver uuid,p_vehicle uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare k text; today date:=(clock_timestamp() at time zone 'America/Puerto_Rico')::date;
begin
 foreach k in array array['registration','insurance','vehicle_front','vehicle_rear','vehicle_left','vehicle_right','vehicle_interior','vin','door_label','inspection'] loop
  if not exists(select 1 from public.vehicle_documents where vehicle_id=p_vehicle and doc_type::text=k
    and status::text='approved' and (expires_on is null or expires_on>=today)
    and public.admin_console_file(storage_path,p_driver)) then return false;end if;
 end loop;
 return true;
end $$;
create function public.admin_console_action(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare s text; a text; id uuid; who uuid; vehicle uuid; old_state text; next_state text; rev integer; note text;
 prior public.admin_console_audit; aid uuid; h text; doc record; t text; k text; today date;
 evidence text; legacy_status public.drivers.status%type;
 affected_driver boolean:=false; driver_revision integer;
begin
 perform public.admin_console_assert();
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k
  where k not in ('section','recordId','action','reason','expectedRevision','idempotencyKey','documentKind','assigneeId'))
  then raise exception 'invalid_input';end if;
 note:=btrim(p_input->>'reason');
 if note is null or length(note) not between 10 and 1000 or p_input->>'idempotencyKey' is null
  or p_input->>'expectedRevision' is null then raise exception 'invalid_input';end if;
 s:=p_input->>'section';a:=p_input->>'action';id:=(p_input->>'recordId')::uuid;
 if s in ('pricing','trips') then raise exception 'admin_read_only' using errcode='42501';end if;
 if id is null then raise exception 'invalid_input';end if;
 h:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||(p_input->>'idempotencyKey'),0));
 select * into prior from public.admin_console_audit where actor_id=auth.uid() and request_key=(p_input->>'idempotencyKey')::uuid;
 if found then
  if prior.request_hash<>h then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('recordId',id,'auditId',prior.id);
 end if;
 today:=(clock_timestamp() at time zone 'America/Puerto_Rico')::date;
 -- Serialize driver/vehicle/document decisions on the driver BEFORE the record.
 if s='drivers' then who:=id;
 elsif s='vehicles' then select driver_id into who from public.vehicles where public.vehicles.id=id;
 elsif s='documents' then
  if p_input->>'documentKind'='driver' then select driver_id into who from public.driver_documents where public.driver_documents.id=id;
  elsif p_input->>'documentKind'='vehicle' then select v.driver_id into who from public.vehicle_documents d join public.vehicles v on v.id=d.vehicle_id where d.id=id;
  else raise exception 'invalid_input';end if;
 end if;
 if s in ('drivers','vehicles','documents') then
  select admin_revision into driver_revision from public.drivers where public.drivers.id=who for update;
  if not found then raise exception 'not_found';end if;
 end if;
 if s='drivers' then
  select approval_status::text,admin_revision into old_state,rev from public.drivers where public.drivers.id=id for update;
 elsif s='vehicles' then
  select status::text,admin_revision into old_state,rev from public.vehicles where public.vehicles.id=id for update;
 elsif s='documents' then
  t:=case when p_input->>'documentKind'='driver' then 'driver_documents' else 'vehicle_documents' end;
  execute format('select status::text state,admin_revision,storage_path,expires_on from public.%I where id=$1 for update',t) into doc using id;
  old_state:=doc.state;rev:=doc.admin_revision;
  evidence:=doc.storage_path;
 elsif s='incidents' then
  select status::text,admin_revision into old_state,rev from public.incidents where public.incidents.id=id for update;
 elsif s='support' then
  select status::text,admin_revision into old_state,rev from public.support_cases where public.support_cases.id=id for update;
 else raise exception 'invalid_input';end if;
 if old_state is null then raise exception 'not_found';end if;
 if rev is distinct from (p_input->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
 if s in ('drivers','vehicles') and exists(select 1 from public.trips where driver_id=who
   and status::text in ('requested','offered','accepted','arrived','in_progress','solicitado','aceptado','en_curso')) then
  raise exception 'driver_has_active_trip';
 end if;
 if s='drivers' then
  if a='approve' and old_state in ('pending_documents','pending_review','suspended') then
   if not exists(select 1 from public.profiles where public.profiles.id=who and role::text='conductor') then raise exception 'invalid_transition';end if;
   select v.id into vehicle from public.vehicles v where v.driver_id=who and v.status::text='active';
   if (select count(*) from public.vehicles where driver_id=who and status::text='active')<>1
     or not public.admin_console_packet(who,vehicle) then raise exception 'document_packet_incomplete';end if;
   foreach k in array array['photo','license_front','ntsp_certificate_1','ntsp_certificate_2','conduct_certificate_1','conduct_certificate_2'] loop
    if not exists(select 1 from public.driver_documents where driver_id=who and doc_type::text=k and status::text='approved'
      and (expires_on is null or expires_on>=today) and public.admin_console_file(storage_path,who)) then
      raise exception 'document_packet_incomplete';end if;
   end loop;
   foreach k in array array['terms_of_service','driver_service','privacy','safety','document_declaration'] loop
    if not exists(select 1 from public.driver_agreement_acceptances where driver_id=who
      and agreement_key=k and version='preview-30-draft-1') then raise exception 'document_packet_incomplete';end if;
   end loop;
   next_state:='approved';
  elsif a='reject' and old_state in ('pending_documents','pending_review') then next_state:='pending_documents';
  elsif a='suspend' and old_state='approved' then next_state:='suspended';
  else raise exception 'invalid_transition';end if;
  legacy_status:=case when next_state='approved' then 'aprobado' when next_state='suspended' then 'suspendido' else 'pendiente' end;
  update public.drivers set approval_status=next_state::public.driver_approval_status,
   status=legacy_status,
   is_online=false,status_kind='offline',review_notes=note,updated_at=clock_timestamp() where public.drivers.id=id;
 elsif s='vehicles' then
  if a='activate' and old_state in ('pending','out_of_service') then
   if not public.admin_console_packet(who,id) or exists(select 1 from public.vehicles where driver_id=who and status::text='active' and public.vehicles.id<>id)
     then raise exception 'document_packet_incomplete';end if;
   next_state:='active';
  elsif a='out_of_service' and old_state in ('pending','active') then next_state:='out_of_service';
  elsif a='retire' and old_state in ('pending','active','out_of_service') then next_state:='retired';
  else raise exception 'invalid_transition';end if;
  update public.vehicles set status=next_state::public.vehicle_status where public.vehicles.id=id;
  if next_state<>'active' then
   update public.drivers set approval_status='suspended',status='suspendido',is_online=false,status_kind='offline',review_notes=note,
    updated_at=clock_timestamp() where public.drivers.id=who and approval_status::text='approved';
   affected_driver:=found;
  end if;
 elsif s='documents' then
  if a not in ('approve','reject') or old_state='expired' then raise exception 'invalid_transition';end if;
  if a='approve' then
   if doc.expires_on<today then raise exception 'document_expired';end if;
   if public.admin_console_file(doc.storage_path,who) is distinct from true then raise exception 'document_path_unsafe';end if;
   if not exists(select 1 from public.admin_console_audit where actor_id=auth.uid() and section='documents' and record_id=id
    and action='open' and record_revision=rev and evidence_path=doc.storage_path
    and created_at>clock_timestamp()-interval '15 minutes') then raise exception 'document_packet_incomplete';end if;
   next_state:='approved';
  else
   if exists(select 1 from public.drivers where public.drivers.id=who and approval_status::text='approved') then
    raise exception 'driver_must_be_suspended';end if;
   next_state:='rejected';
  end if;
  execute format('update public.%I set status=$1::public.document_status,reviewer_id=auth.uid(),review_notes=$2,updated_at=clock_timestamp() where id=$3',t)
   using next_state,note,id;
 elsif s in ('incidents','support') then
  if a='assign' then
   if not (p_input?'assigneeId') then raise exception 'invalid_input';end if;
   if p_input->>'assigneeId' is not null and not exists(select 1 from public.profiles where public.profiles.id=(p_input->>'assigneeId')::uuid and role::text='admin') then
    raise exception 'assignee_not_admin';end if;
   next_state:=old_state;
  elsif a='reopen' and old_state in ('resolved','closed') then next_state:='open';
  elsif a='resolve' and old_state not in ('resolved','closed') then next_state:='resolved';
  elsif a='close' and old_state='resolved' then next_state:='closed';
  elsif s='incidents' and a='triage' and old_state='open' then next_state:='triaged';
  elsif s='incidents' and a='review' and old_state in ('open','triaged') then next_state:='under_review';
  else raise exception 'invalid_transition';end if;
  if s='incidents' then
   update public.incidents set status=next_state::public.incident_status,
    assignee_id=case when a='assign' then (p_input->>'assigneeId')::uuid else assignee_id end,
    resolution_notes=case when next_state in ('resolved','closed') then note else null end,
    resolved_by=case when next_state in ('resolved','closed') then auth.uid() else null end,
    resolved_at=case when next_state in ('resolved','closed') then clock_timestamp() else null end,updated_at=clock_timestamp()
    where public.incidents.id=id;
  else
   update public.support_cases set status=next_state::public.support_case_status,
    assignee_id=case when a='assign' then (p_input->>'assigneeId')::uuid else assignee_id end,updated_at=clock_timestamp()
    where public.support_cases.id=id;
  end if;
 end if;
 insert into public.admin_console_audit(actor_id,section,record_id,action,reason,from_status,to_status,request_key,request_hash,evidence_path,record_revision)
  values(auth.uid(),s,id,a,note,old_state,next_state,(p_input->>'idempotencyKey')::uuid,h,
    evidence,rev) returning public.admin_console_audit.id into aid;
 if affected_driver then
  insert into public.admin_console_audit(actor_id,section,record_id,action,reason,from_status,to_status,request_key,request_hash,record_revision,parent_audit_id)
   values(auth.uid(),'drivers',who,'suspend_vehicle_unavailable',note,'approved','suspended',gen_random_uuid(),h,driver_revision,aid);
 end if;
 return jsonb_build_object('recordId',id,'auditId',aid);
end $$;
create function public.admin_console_audit_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_admin_audit' using errcode='42501';end $$;
create trigger immutable_admin_audit before update or delete on public.admin_console_audit
 for each row execute function public.admin_console_audit_immutable();
revoke all on function public.admin_console_file(text,uuid),public.admin_console_packet(uuid,uuid),
 public.admin_console_audit_immutable(),public.admin_console_document(jsonb),public.admin_console_action(jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.admin_console_document(jsonb),public.admin_console_action(jsonb) to authenticated;
commit;
