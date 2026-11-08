-- BORRADOR. Close the suspend-versus-accept race without replacing accept_trip.
-- Locking the driver's row sees committed suspension even when accept_trip's
-- earlier eligibility check ran before the administrative transaction committed.
begin;
create function public.admin_console_assignment_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare d record;
begin
 if new.driver_id is null or new.status::text not in ('accepted','aceptado') then return new;end if;
 if tg_op='UPDATE' then
  if old.driver_id is not distinct from new.driver_id and old.status::text in ('accepted','aceptado') then return new;end if;
 end if;
 select approval_status,is_online,status_kind into d from public.drivers where id=new.driver_id for update;
 if not found or d.approval_status::text<>'approved' or d.is_online is distinct from true or d.status_kind::text<>'online' then
  raise exception 'approved_online_driver_required' using errcode='42501';
 end if;
 return new;
end $$;
create trigger z_admin_assignment_guard before insert or update of driver_id,status on public.trips
 for each row execute function public.admin_console_assignment_guard();
revoke all on function public.admin_console_assignment_guard() from public,anon,authenticated,service_role;
commit;
