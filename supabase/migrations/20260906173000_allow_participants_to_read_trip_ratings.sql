create policy "trip_participants_can_read_ratings"
on public.ratings
for select
to authenticated
using (
  rated_by = auth.uid()
  or rated_user = auth.uid()
);