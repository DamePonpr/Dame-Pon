-- CORRECTIVE ROLLBACK TEMPLATE ONLY. NOT a migration, NOT executed automatically.
-- Requires separate authorization for the target environment.
-- Retains all rows, sessions, functions, private RLS and notification freshness.
begin;
update public.driver_gps_rollout set enforce_fresh_gps = false where singleton;
update public.driver_gps_cohorts set enforce_fresh_gps = false;
commit;
