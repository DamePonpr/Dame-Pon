---
name: Supabase migration reconciliation
description: How to reconcile repository migration files with Supabase history when names, timestamps, or superseding migrations differ.
---

Compare the remote migration history with the live schema before applying a repository migration that appears missing. A missing history row does not prove that its effect is absent: later migrations or an earlier manually applied migration may already provide it.

**Why:** The Dame Pon project had several repository migration names absent from the remote history, while their policies and functions were already present or superseded. Replaying them would have been redundant and could have changed policy behavior.

**How to apply:** Use the Supabase migration-application flow only for missing live effects, then confirm the new history row, inspect the created function or policies, and run an authenticated functional check for both participant roles. The migration tool may assign a fresh remote version timestamp rather than the local filename timestamp.