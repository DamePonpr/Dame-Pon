-- Dame Pon preview-30 — remote grant reconciliation record
--
-- STATUS: ALREADY APPLIED REMOTELY.
-- The GRANT/REVOKE corrections in the live Supabase project were performed
-- manually while reconciling the preview-29 RLS hardening. Do not execute or
-- replay this file against the remote project. It remains in the repository
-- as an audit marker for environments that need to compare privileges.
--
-- No-op by design: the corrective statements are intentionally not replayed.
select 1 as already_applied_remotely;