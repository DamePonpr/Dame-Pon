---
name: Ride realtime resilience
description: Reliability rule for keeping passenger and driver trip state synchronized.
---

Treat Supabase Realtime as a fast notification path, not the sole source of delivery guarantees. Keep an authenticated periodic reconciliation path for active and open trips.

**Why:** A channel can report that it subscribed successfully while database changes still do not reach a client, whether because publication delivery is unavailable or an event is missed during a connection interruption.

**How to apply:** Any passenger or driver screen whose correctness depends on trip changes should refresh from the authoritative table on both realtime notifications and a bounded periodic interval, cleaning up both mechanisms on unmount.