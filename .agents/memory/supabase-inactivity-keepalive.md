---
name: Supabase inactivity keepalive
description: Project inactivity is measured from public API traffic, not administrative SQL activity.
---

For Dame Pon, Supabase's inactivity monitor does not treat a scheduled SQL insert through the administrative database connection as activity. Keepalive must make public API requests to the project's `*.supabase.co` endpoints.

**Why:** The project was paused for inactivity even though its SQL-based ping job had been inserting rows.

**How to apply:** Maintain a scheduled public API request (REST/Auth/Storage/Realtime). If a row is needed for audit, expose only a narrowly scoped, rate-limited RPC with a fixed payload, and also verify public REST and Auth endpoints.
