---
name: Role-safe session routing
description: Auth and route safeguards for switching between passenger and driver accounts in the Dame Pon mobile app.
---

The loaded Supabase profile is the authority for panel selection. A home route must render only when the profile ID matches the current session user ID, the profile role is known, and it matches the route's expected role. During hydration or account switching, show loading and clear role-scoped state; do not default an unknown role.

**Why:** A stale `/home/driver` route can survive logout and be reused by a passenger if the screen trusts a hardcoded route prop. A fallback role also masks missing or stale profile data.

**How to apply:** Clear the profile before hydrating a new session, invalidate older hydration requests, clear local driver/trip state on identity changes, guard both home routes, and redirect mismatches to the route derived from the loaded profile.