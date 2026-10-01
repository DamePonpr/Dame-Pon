-- Allow the scheduled public API keepalive to read the non-sensitive ping row.
begin;

grant select on table public.keepalive_ping to anon, authenticated;

drop policy if exists keepalive_ping_public_read on public.keepalive_ping;
create policy keepalive_ping_public_read
  on public.keepalive_ping
  for select
  to anon, authenticated
  using (true);

commit;