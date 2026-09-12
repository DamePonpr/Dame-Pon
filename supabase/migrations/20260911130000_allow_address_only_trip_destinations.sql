-- The current mobile request collects the destination as an address only.
-- Do not fabricate destination coordinates from the pickup location.
alter table public.trips
  alter column dropoff_lat drop not null;

alter table public.trips
  alter column dropoff_lng drop not null;