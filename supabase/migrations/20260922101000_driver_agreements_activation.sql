-- Dame Pon preview-30 — driver agreements and activation
--
-- Apply manually after 20260922100000_driver_onboarding_document_types.sql.

begin;

create table if not exists public.driver_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  agreement_key text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  accepted_ip inet,
  user_agent text not null default 'Dame Pon Expo',
  unique (driver_id, agreement_key, version)
);

create index if not exists driver_agreement_acceptances_driver_idx
  on public.driver_agreement_acceptances(driver_id, accepted_at desc);

alter table public.driver_agreement_acceptances enable row level security;

drop policy if exists driver_agreement_acceptances_owner_read
  on public.driver_agreement_acceptances;
create policy driver_agreement_acceptances_owner_read
on public.driver_agreement_acceptances
for select to authenticated
using (driver_id = auth.uid());

drop policy if exists driver_agreement_acceptances_owner_insert
  on public.driver_agreement_acceptances;
create policy driver_agreement_acceptances_owner_insert
on public.driver_agreement_acceptances
for insert to authenticated
with check (driver_id = auth.uid());

create table if not exists public.driver_activation_codes (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (driver_id, code)
);

create unique index if not exists driver_activation_codes_one_open_idx
  on public.driver_activation_codes(driver_id)
  where activated_at is null;

alter table public.driver_activation_codes enable row level security;

drop policy if exists driver_activation_codes_owner_read
  on public.driver_activation_codes;
create policy driver_activation_codes_owner_read
on public.driver_activation_codes
for select to authenticated
using (driver_id = auth.uid());

create or replace function public.issue_driver_activation_code()
returns public.driver_activation_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_code public.driver_activation_codes;
  issued public.driver_activation_codes;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into existing_code
  from public.driver_activation_codes
  where driver_id = auth.uid()
    and activated_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;
  if existing_code.id is not null then
    return existing_code;
  end if;

  if not exists (
    select 1 from public.drivers
    where id = auth.uid()
      and approval_status = 'approved'::public.driver_approval_status
      and onboarding_step >= 6
  ) then
    raise exception 'El registro todavía no está aprobado' using errcode = '42501';
  end if;

  insert into public.driver_activation_codes (driver_id, code, expires_at)
  values (
    auth.uid(),
    lpad((floor(random() * 1000000))::integer::text, 6, '0'),
    now() + interval '7 days'
  )
  returning * into issued;
  return issued;
end;
$$;

revoke all on function public.issue_driver_activation_code() from public;
grant execute on function public.issue_driver_activation_code() to authenticated;

create or replace function public.accept_driver_agreement(
  p_agreement_key text,
  p_version text,
  p_user_agent text default 'Dame Pon Expo'
)
returns public.driver_agreement_acceptances
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted public.driver_agreement_acceptances;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  insert into public.driver_agreement_acceptances (
    driver_id, agreement_key, version, accepted_ip, user_agent
  )
  values (
    auth.uid(), p_agreement_key, p_version, inet_client_addr(),
    coalesce(nullif(trim(p_user_agent), ''), 'Dame Pon Expo')
  )
  on conflict (driver_id, agreement_key, version)
  do update set accepted_at = now(), accepted_ip = excluded.accepted_ip,
                user_agent = excluded.user_agent
  returning * into accepted;

  return accepted;
end;
$$;

revoke all on function public.accept_driver_agreement(text, text, text) from public;
grant execute on function public.accept_driver_agreement(text, text, text) to authenticated;

create or replace function public.activate_driver_with_code(p_code text)
returns public.drivers
language plpgsql
security definer
set search_path = public
as $$
declare
  activated public.drivers;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  update public.driver_activation_codes
  set activated_at = now()
  where driver_id = auth.uid()
    and code = trim(p_code)
    and activated_at is null
    and expires_at > now();

  if not found then
    raise exception 'Código de activación inválido o expirado' using errcode = '22023';
  end if;

  update public.drivers
  set onboarding_step = 6,
      is_online = false,
      status_kind = 'offline'::public.driver_status_kind
  where id = auth.uid()
    and approval_status = 'approved'::public.driver_approval_status
  returning * into activated;

  if activated.id is null then
    raise exception 'El conductor todavía no está aprobado' using errcode = '42501';
  end if;

  update public.profiles
  set onboarding_completed = true
  where id = auth.uid();

  return activated;
end;
$$;

revoke all on function public.activate_driver_with_code(text) from public;
grant execute on function public.activate_driver_with_code(text) to authenticated;

commit;