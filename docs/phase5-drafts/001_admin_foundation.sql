-- BORRADOR. NO AUTOAPLICAR. Supabase externo; ejecutar solo con autorización.
-- Requiere A1, documentos B y onboarding reconciliados. Todo en una transacción.
begin;
create table public.admin_console_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references public.profiles(id),
 section text not null, record_id uuid not null, action text not null,
 reason text not null check(length(btrim(reason)) between 10 and 1000),
 from_status text, to_status text, created_at timestamptz not null default clock_timestamp(),
 request_key uuid not null, request_hash text not null, evidence_path text, record_revision integer,
 parent_audit_id uuid references public.admin_console_audit(id),
 unique(actor_id,request_key)
);
alter table public.admin_console_audit enable row level security;
revoke all on public.admin_console_audit from public,anon,authenticated,service_role;
grant select(id,actor_id,section,record_id,action,reason,from_status,to_status,created_at)
 on public.admin_console_audit to authenticated;
create policy admin_console_audit_read on public.admin_console_audit for select to authenticated using(public.is_admin());
create index admin_console_audit_record on public.admin_console_audit(section,record_id,created_at desc);
create index admin_console_audit_evidence on public.admin_console_audit(evidence_path) where evidence_path is not null;
create table public.admin_document_tickets (
 actor_id uuid not null references public.profiles(id),
 path text not null, expires_at timestamptz not null,
 primary key(actor_id,path)
);
alter table public.admin_document_tickets enable row level security;
revoke all on public.admin_document_tickets from public,anon,authenticated,service_role;
alter table public.incidents add column if not exists assignee_id uuid references public.profiles(id);
-- Revisions cover owner edits as well: approval cannot race a resubmission.
do $$
declare t text;
begin
 foreach t in array array['drivers','vehicles','driver_documents','vehicle_documents','incidents','support_cases'] loop
  execute format('alter table public.%I add column if not exists admin_revision integer not null default 0',t);
 end loop;
end $$;
create function public.admin_console_revision() returns trigger language plpgsql set search_path='' as $$
begin new.admin_revision:=old.admin_revision+1;return new;end $$;
do $$
declare t text;
begin
 foreach t in array array['drivers','vehicles','driver_documents','vehicle_documents','incidents','support_cases'] loop
  execute format('create trigger zz_admin_revision before update on public.%I for each row execute function public.admin_console_revision()',t);
 end loop;
end $$;
create function public.admin_console_assert() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.is_admin() is distinct from true then raise exception 'admin_required' using errcode='42501';end if;
end $$;
create function public.admin_console_protect_fields() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') then
  if public.is_admin() then raise exception 'admin_rpc_required' using errcode='42501';end if;
  if tg_table_name='drivers' then
   if new.approval_status is distinct from old.approval_status or new.status is distinct from old.status
      or new.review_notes is distinct from old.review_notes then
    -- Owner may still move between pending states, as existing onboarding permits.
    if not (new.approval_status::text in ('pending_documents','pending_review')
      and old.approval_status::text in ('pending_documents','pending_review')
      and new.status is not distinct from old.status and new.review_notes is not distinct from old.review_notes)
      then raise exception 'admin_rpc_required' using errcode='42501';end if;
   end if;
  elsif tg_table_name='vehicles' then
    if new.status is distinct from old.status or
      (old.status::text='active' and
       (new.make,new.model,new.year,new.color,new.plate,new.vin) is distinct from
       (old.make,old.model,old.year,old.color,old.plate,old.vin)) then
      raise exception 'admin_rpc_required' using errcode='42501';end if;
  elsif tg_table_name in ('driver_documents','vehicle_documents') then
    if new.status::text not in ('pending','submitted') or new.reviewer_id is not null or new.review_notes is not null then
      raise exception 'admin_rpc_required' using errcode='42501';end if;
  end if;
 end if;
 return new;
end $$;
create trigger z_admin_privileged_fields before update on public.drivers
 for each row execute function public.admin_console_protect_fields();
create trigger z_admin_privileged_fields before update on public.vehicles
 for each row execute function public.admin_console_protect_fields();
create trigger z_admin_privileged_fields before insert or update on public.driver_documents
 for each row execute function public.admin_console_protect_fields();
create trigger z_admin_privileged_fields before insert or update on public.vehicle_documents
 for each row execute function public.admin_console_protect_fields();
-- These tables had owner INSERT/SELECT and general admin UPDATE policies.
-- Dedicated definer RPC replaces general writes, without touching owner INSERT.
revoke update,delete on public.incidents,public.support_cases from authenticated;
-- Legacy prices remain SELECT-only; no administrative price writes in this phase.
revoke insert,update,delete on public.fare_rules from authenticated;
revoke delete on public.drivers,public.vehicles,public.driver_documents,public.vehicle_documents from authenticated;
create function public.admin_document_can_read(p_path text) returns boolean
 language sql stable security definer set search_path='' as $$
 select public.is_admin() and exists(select 1 from public.admin_document_tickets
  where actor_id=auth.uid() and path=p_path and expires_at>clock_timestamp())
$$;
create function public.admin_document_referenced(p_path text) returns boolean
 language plpgsql stable security definer set search_path='' as $$
begin
 if split_part(p_path,'/',1) is distinct from auth.uid()::text and public.is_admin() is distinct from true then return true;end if;
 return exists(select 1 from public.driver_documents where storage_path=p_path)
   or exists(select 1 from public.vehicle_documents where storage_path=p_path)
   or exists(select 1 from public.admin_console_audit where evidence_path=p_path);
end $$;
create policy admin_document_ticket_read on storage.objects for select to authenticated
 using(bucket_id='driver-documents' and public.admin_document_can_read(name));
-- Immutable evidence: no owner overwrite/delete of a referenced or reviewed file.
-- Existing upload uses unique timestamp paths, upsert:false.
create policy admin_document_no_overwrite on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'driver-documents' or not public.admin_document_referenced(name))
 with check(bucket_id<>'driver-documents' or not public.admin_document_referenced(name));
create policy admin_document_no_delete on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'driver-documents' or not public.admin_document_referenced(name));
create function public.admin_console_session() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.admin_console_assert();
 return jsonb_build_object('actorId',auth.uid(),'role','admin','schemaVersion','phase5-v1');
end $$;
create function public.admin_console_overview() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.admin_console_assert();
 return jsonb_build_object(
  'driversPending',(select count(*) from public.drivers where approval_status::text in ('pending_documents','pending_review')),
  'incidentsOpen',(select count(*) from public.incidents where status::text not in ('resolved','closed')),
  'supportOpen',(select count(*) from public.support_cases where status::text not in ('resolved','closed')),
  'tripsActive',(select count(*) from public.trips where status::text in ('requested','offered','accepted','arrived','in_progress','solicitado','aceptado','en_curso')),
  'asOf',clock_timestamp());
end $$;
create function public.admin_console_assignees() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.admin_console_assert();
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',coalesce(full_name,'Administración')) order by id)
  from public.profiles where role::text='admin'),'[]'::jsonb);
end $$;
-- Helpers and triggers are not API entry points.
revoke all on function public.admin_console_revision(),public.admin_console_assert(),public.admin_console_protect_fields() from public,anon,authenticated,service_role;
revoke all on function public.admin_document_can_read(text),public.admin_document_referenced(text),
 public.admin_console_session(),public.admin_console_overview(),public.admin_console_assignees() from public,anon,authenticated,service_role;
grant execute on function public.admin_document_can_read(text),public.admin_document_referenced(text),
 public.admin_console_session(),public.admin_console_overview(),public.admin_console_assignees() to authenticated;
commit;
