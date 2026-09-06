alter table public.profiles
add column if not exists push_token text;

create or replace function public.set_my_push_token(p_push_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_push_token is null
    or length(p_push_token) > 255
    or p_push_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'
  then
    raise exception 'invalid Expo push token';
  end if;

  update public.profiles
  set push_token = p_push_token
  where id = auth.uid();
end;
$$;

revoke all on function public.set_my_push_token(text) from public;
grant execute on function public.set_my_push_token(text) to authenticated;