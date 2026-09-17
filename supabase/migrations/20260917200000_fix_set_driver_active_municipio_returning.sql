-- El RPC devuelve la fila actualizada; RETURN QUERY necesita que el UPDATE
-- produzca tuplas explícitamente.
create or replace function public.set_driver_active_municipio(p_municipio text)
returns setof public.drivers
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.municipios where nombre = p_municipio) then
    raise exception 'Municipio activo inválido' using errcode = '22023';
  end if;

  return query
  update public.drivers
  set municipio_activo = p_municipio,
      municipios_activos = array[p_municipio]::text[]
  where id = auth.uid()
  returning *;

  if not found then
    raise exception 'No encontramos tu perfil de conductor' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.set_driver_active_municipio(text) from public;
grant execute on function public.set_driver_active_municipio(text) to authenticated;