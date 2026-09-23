-- Dame Pon preview-31 — driver registration does not require a license number
--
-- The live project was reconciled manually before this repository marker was
-- added. Keep this migration for environments that still have the old constraint.

alter table public.drivers
  alter column license_number drop not null;