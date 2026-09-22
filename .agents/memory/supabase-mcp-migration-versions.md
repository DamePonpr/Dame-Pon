---
name: Supabase MCP migration versions
description: Version behavior when applying repository SQL through the Supabase MCP
---

Supabase MCP `applyMigration` records the migration name with a generated remote version; it does not necessarily use the timestamp in the repository filename.

**Why:** The remote migration history can therefore contain the correct migration name with a different version from the local file, while the SQL effects are already applied.

**How to apply:** After every MCP migration, call `listMigrations` and use the remote name/version as the source of truth before replaying or reconciling repository migrations.