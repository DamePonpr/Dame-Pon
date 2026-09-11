-- Participants may read only ratings they sent or received.
create policy "authenticated_participants_read_own_ratings"
on public.ratings
for select
to authenticated
using (
  rated_by = auth.uid()
  or rated_user = auth.uid()
);