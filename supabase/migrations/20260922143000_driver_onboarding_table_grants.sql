-- Dame Pon preview-30 — table privileges for onboarding RPC-backed records
--
-- The owner policies are present, but RLS does not replace table privileges.

begin;

grant select, insert
on table public.driver_agreement_acceptances
to authenticated;

grant select, insert
on table public.driver_activation_codes
to authenticated;

commit;