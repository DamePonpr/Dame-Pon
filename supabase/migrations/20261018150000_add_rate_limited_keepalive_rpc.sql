-- Let the public API keepalive record one fixed, rate-limited activity row.
begin;

create or replace function public.record_keepalive_ping()
returns table (id bigint, creado_en timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_id bigint;
  v_creado_en timestamptz;
begin
  -- Serialize callers so concurrent requests cannot create duplicate pings.
  perform pg_catalog.pg_advisory_xact_lock(121354, 1);

  select ping.id, ping.creado_en
    into v_id, v_creado_en
  from public.keepalive_ping as ping
  order by ping.creado_en desc, ping.id desc
  limit 1;

  if v_creado_en is null
     or v_creado_en < pg_catalog.now() - interval '23 hours' then
    insert into public.keepalive_ping as ping (nota)
    values ('api_keepalive')
    returning ping.id, ping.creado_en into v_id, v_creado_en;
  end if;

  return query select v_id, v_creado_en;
end;
$function$;

revoke all on function public.record_keepalive_ping() from public;
grant execute on function public.record_keepalive_ping() to anon, authenticated;

commit;
