---
name: Road routing boundaries and provider limits
description: Keep roadway estimates separate from fares, driver GPS and background/navigation promises.
---

Route metrics are display-only estimates from the routing provider. Do not
write them into pricing-related trip fields without a separately authorized
pricing/schema change.

**Why:** The user explicitly excludes current fares/payments from the maps phase;
existing pickup/dropoff fields already let authorized participants recalculate.

**How to apply:** Use only selected/authorized trip endpoints for routing, never
private driver GPS as an implicit origin. Require explicit confirmation after
address selection; typed text and municipality centroids are not pickup points.

Public OSRM/Photon are limited community services, not a fleet SLA. FOSSGIS's
car profile rejects exclude=ferry; reject ferry segments from actual step modes
instead of silently dropping the exclusion and claiming a road-only route.

**Why:** Provider verification exposed that unsupported option. Client-side
rate limiting also cannot coordinate all devices in a fleet.

**How to apply:** Keep attribution/privacy disclosure, bounded requests/cache,
and distinguish a single public-landmark HTTP probe from real Android testing.
Do not claim live traffic, guided navigation, background tracking or production
capacity without actually implementing/verifying them.
