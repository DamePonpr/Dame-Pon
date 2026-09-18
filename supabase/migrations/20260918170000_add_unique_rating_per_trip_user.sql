-- Each participant may rate the other once per completed trip.
-- This allows the two reciprocal rows while preventing duplicate submissions
-- by the same participant.
alter table public.ratings
  add constraint ratings_trip_id_rated_by_key unique (trip_id, rated_by);