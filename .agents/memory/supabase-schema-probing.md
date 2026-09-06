---
name: Supabase schema probing
description: How to confirm exposed PostgREST columns and enum values when OpenAPI introspection is restricted.
---

When Supabase's PostgREST OpenAPI root requires a secret key, a publishable key can still validate individual columns and enum candidates with zero-row `select` filters.

**Why:** This project restricts anonymous table access with RLS and restricts OpenAPI introspection, but PostgREST validates column names, types, and enum casts before returning the RLS denial. That makes `42703`/`22P02` distinguish schema mismatches from a valid request that reaches `42501`.

**How to apply:** Probe only with `limit=0` reads or writes guaranteed to be denied by anonymous RLS. Treat `42501` as confirmation that the request shape passed schema validation, never as proof that authenticated policies permit the operation.