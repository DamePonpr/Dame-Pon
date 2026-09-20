export interface RatingRecord {
  trip_id: string;
  rated_by: string;
  rated_user: string;
  score: number;
}

export interface CompletedTripRecord {
  id: string;
}

export function findUnratedCompletedTrip(
  trips: CompletedTripRecord[],
  ratings: RatingRecord[],
  userId: string,
): CompletedTripRecord | null;

export function ratingSummaryForUser(
  ratings: RatingRecord[],
  userId: string,
  tripId: string,
): {
  sentRating: number | null;
  receivedRating: number | null;
};

export function averageReceivedRating(ratings: RatingRecord[], userId: string): number | null;