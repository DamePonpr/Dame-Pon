create policy "trip_participants_can_rate_each_other"
on public.ratings
for insert
to authenticated
with check (
  rated_by = auth.uid()
  and score between 1 and 5
  and exists (
    select 1
    from public.trips
    where trips.id = ratings.trip_id
      and trips.status = 'completado'
      and (
        (
          trips.passenger_id = auth.uid()
          and trips.driver_id = ratings.rated_user
        )
        or
        (
          trips.driver_id = auth.uid()
          and trips.passenger_id = ratings.rated_user
        )
      )
  )
);