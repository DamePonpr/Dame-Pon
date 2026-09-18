---
name: Reciprocal trip ratings
description: Data and UI rules for allowing both Dame Pon trip participants to rate each other.
---

A trip can have two rating rows, one per participant. “Already rated” must always filter by both `trip_id` and the current user's `rated_by`; history uses `rated_by` for sent and `rated_user` for received, and profile averages use received rows only.

**Why:** A trip-level existence check makes the first participant's rating hide the second participant's rating. The database must enforce uniqueness per participant, not per trip.

**How to apply:** Keep the unique constraint on `(trip_id, rated_by)`, derive pending-rating state from the current user, and calculate displayed averages from `ratings.rated_user` rather than trusting a stale profile default.