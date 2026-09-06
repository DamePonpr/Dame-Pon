---
name: Ride realtime resilience
description: Reliability rule for keeping passenger and driver trip state synchronized.
---

Treat Supabase Realtime as a fast notification path, not the sole source of delivery guarantees. Keep an authenticated periodic reconciliation path for active and open trips.

**Why:** A channel can report that it subscribed successfully while database changes still do not reach a client, whether because publication delivery is unavailable or an event is missed during a connection interruption.

**How to apply:** Any passenger or driver screen whose correctness depends on trip changes should refresh from the authoritative table on both realtime notifications and a bounded periodic interval, cleaning up both mechanisms on unmount.

When verifying offline recovery, interrupt both Realtime and REST access for the affected session, confirm the socket/channel actually close and rejoin, and let the existing periodic reconciliation discover the missed state.

**Why:** Pausing a test observer and manually querying after reconnect can pass even if no real disconnect or resubscription occurred.

**How to apply:** Assert the client cannot observe changes during the outage, wait for verified transport/channel recovery, then require the normal reconciliation timer to load the authoritative state without a manual refresh.