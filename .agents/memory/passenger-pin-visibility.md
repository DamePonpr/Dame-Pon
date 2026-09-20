---
name: Passenger PIN visibility
description: The trip PIN must be returned only through a passenger-scoped read path and never through driver trip queries or lifecycle RPC results.
---

Keep `passenger_pin` out of driver-facing trip selects and RPC result types. Expose it only through a passenger-scoped query that filters by the authenticated passenger.

**Why:** PostgreSQL RLS restricts rows, not columns. A driver who can read an allowed trip row could otherwise request the passenger PIN directly from PostgREST.

**How to apply:** When adding trip views, queries, Edge Functions, or generated types, treat the PIN as passenger-only data; lifecycle functions should accept it as input without returning it.