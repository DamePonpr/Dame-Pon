-- El registro de conductores necesita cargar el catálogo antes de que exista
-- una sesión autenticada. El catálogo no contiene datos privados.
drop policy if exists "authenticated_users_can_read_municipios" on public.municipios;
create policy "authenticated_users_can_read_municipios"
on public.municipios
for select
to anon, authenticated
using (true);

grant select on public.municipios to anon, authenticated;