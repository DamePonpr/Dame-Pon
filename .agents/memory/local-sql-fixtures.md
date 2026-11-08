---
name: Local SQL verification fidelity
description: Preserve real enum semantics and avoid resource contention in isolated PostgreSQL verification.
---

Use persisted enum definitions, not arbitrary text, in local database fixtures
for business states.

**Why:** A free-text vehicle fixture admitted a nonexistent approval value and
masked a quote eligibility error that would reject every real eligible vehicle.

**How to apply:** Extract historical enum definitions or faithfully reproduce
their values before testing pending SQL. Do not weaken a state assertion to make
a fixture pass.

Run the full database-heavy suite serially, separate from concurrent builds.

**Why:** Concurrent PostgreSQL initialization and builds exhausted the local
initdb timeout; the same complete suite passed serially without weakening tests.

**How to apply:** Use Node's `--test-concurrency=1` for the full local suite.
Distinguish initialization/resource failures from application/RLS failures.
