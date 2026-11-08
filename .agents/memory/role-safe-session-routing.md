---
name: Role-safe session routing
description: Auth and route safeguards for switching between passenger and driver accounts in the Dame Pon mobile app.
---

The loaded Supabase profile is the authority for panel selection. A home route must render only when the profile ID matches the current session user ID, the profile role is known, and it matches the route's expected role. During hydration or account switching, show loading and clear role-scoped state; do not default an unknown role.

**Why:** A stale `/home/driver` route can survive logout and be reused by a passenger if the screen trusts a hardcoded route prop. A fallback role also masks missing or stale profile data.

**How to apply:** Clear the profile before hydrating a new session, invalidate older hydration requests, and clear local driver/trip state on identity changes. Guard private routes and onboarding before mounting their content. A wrong-app session must offer sign-out or opening the matching app, not redirect to a same-named home route in the wrong distribution.

Passenger and conductor distributions each support only their own registration role. Opening an existing account in the other app must never convert its role or rewrite its existing driver records or documents.

**Why:** The user requires separate single-role apps, not a shared role selector. Existing approved conductors and their documents must survive the registration restrictions unchanged.

**How to apply:** Treat the installed app's role as a registration constraint, never as permission to migrate the loaded Supabase account. Keep authentication and existing data intact; reject incompatible access instead.