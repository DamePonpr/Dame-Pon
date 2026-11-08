---
name: Foreground driver presence and coordinated activation
description: Honest foreground-only behavior, freshness semantics and rollout constraints for GPS presence.
---

Do not infer working background GPS from Android permissions alone. Without an
implemented compatible background task, keep foreground tracking explicit and
make minimizing the app stop availability; require explicit reactivation.

**Why:** The user requires real device GPS, not simulated background support.
The installed app must not claim to be available after tracking has stopped.

**How to apply:** Own tracking at the authenticated-session level, not the home
screen lifetime. Stop watchers before sign-out removes credentials. A missing
network acknowledgement is not a confirmed remote offline transition.
Make confirmed offline cleanup idempotent across sign-out and provider unmount:
both lifecycle paths can run for the same session, including after logout.

Use a short server-confirmed GPS freshness lease, not generic record update
time or a permanently persisted online bit.

**Why:** A killed process or disconnected phone cannot reliably publish its own
offline state; municipality/document edits must not refresh location age.

**How to apply:** Expire safe availability and passenger markers without a
background heartbeat, and preserve authenticated periodic reconciliation.

Coordinate stricter server presence requirements with compatible app releases.
Do not activate those requirements independently without explicit approval.

**Why:** Existing app versions without the new GPS publisher cannot satisfy the
freshness requirement. The user chose coordinated rather than immediate activation.

**How to apply:** Distinguish prepared client/migration code from active backend
behavior in reports. Unit tests and browser fixtures do not prove physical GPS
or live RLS authorization; require controlled backend and Android-device checks.

Never restore assigned-passenger SELECT or Realtime publication of private driver
rows as a shortcut for GPS. Use an assignment-scoped minimal RPC instead.

**Why:** RLS filters rows, not fields; the private row also contains license and
review information. Polling is preferable to exposing that row for Realtime.

**How to apply:** Keep own-driver access; expire passenger coordinates on the
server and client. Keep strict dispatch gating off until compatible clients
and notification filtering are ready. Fence presence by Auth session, server
generation and sequence: a local queue alone cannot order timed-out HTTP requests
or prevent an old device's cleanup from stopping a new session.
