export function findUnratedCompletedTrip(trips, ratings, userId) {
  const ratedTripIds = new Set(
    ratings
      .filter((rating) => rating.rated_by === userId)
      .map((rating) => rating.trip_id),
  );
  return trips.find((trip) => !ratedTripIds.has(trip.id)) ?? null;
}

export function ratingSummaryForUser(ratings, userId, tripId) {
  const sent = ratings.find(
    (rating) => rating.trip_id === tripId && rating.rated_by === userId,
  );
  const received = ratings.find(
    (rating) => rating.trip_id === tripId && rating.rated_user === userId,
  );
  return {
    sentRating: sent?.score ?? null,
    receivedRating: received?.score ?? null,
  };
}

export function averageReceivedRating(ratings, userId) {
  const receivedScores = ratings
    .filter((rating) => rating.rated_user === userId)
    .map((rating) => rating.score);
  if (!receivedScores.length) return null;
  const average = receivedScores.reduce((total, score) => total + score, 0) / receivedScores.length;
  return Math.round(average * 10) / 10;
}