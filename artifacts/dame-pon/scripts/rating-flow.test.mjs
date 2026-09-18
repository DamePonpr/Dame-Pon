import assert from 'node:assert/strict';
import test from 'node:test';
import {
  averageReceivedRating,
  findUnratedCompletedTrip,
  ratingSummaryForUser,
} from '../lib/ratingLogic.js';

const driverId = 'driver-user';
const passengerId = 'passenger-user';
const trip = { id: 'completed-trip' };

function runRatingOrder(order) {
  const ratings = [];

  for (const rater of order) {
    const unratedTrip = findUnratedCompletedTrip([trip], ratings, rater);
    assert.equal(unratedTrip?.id, trip.id, `${rater} debe ver las estrellas aunque la otra persona ya calificó`);
    const ratedUser = rater === driverId ? passengerId : driverId;
    ratings.push({
      trip_id: trip.id,
      rated_by: rater,
      rated_user: ratedUser,
      score: rater === driverId ? 5 : 4,
    });
  }

  return ratings;
}

test('guarda ambas calificaciones cuando primero califica el conductor', () => {
  const ratings = runRatingOrder([driverId, passengerId]);
  assert.equal(ratings.length, 2);
  assert.deepEqual(ratingSummaryForUser(ratings, driverId, trip.id), {
    sentRating: 5,
    receivedRating: 4,
  });
  assert.deepEqual(ratingSummaryForUser(ratings, passengerId, trip.id), {
    sentRating: 4,
    receivedRating: 5,
  });
});

test('guarda ambas calificaciones cuando primero califica el pasajero', () => {
  const ratings = runRatingOrder([passengerId, driverId]);
  assert.equal(ratings.length, 2);
  assert.deepEqual(ratingSummaryForUser(ratings, driverId, trip.id), {
    sentRating: 5,
    receivedRating: 4,
  });
  assert.deepEqual(ratingSummaryForUser(ratings, passengerId, trip.id), {
    sentRating: 4,
    receivedRating: 5,
  });
});

test('el promedio usa solo las calificaciones recibidas', () => {
  const ratings = [
    { trip_id: 'one', rated_by: driverId, rated_user: passengerId, score: 5 },
    { trip_id: 'two', rated_by: passengerId, rated_user: driverId, score: 4 },
    { trip_id: 'three', rated_by: 'other-user', rated_user: driverId, score: 5 },
  ];
  assert.equal(averageReceivedRating(ratings, driverId), 4.5);
  assert.equal(averageReceivedRating(ratings, passengerId), 5);
  assert.equal(averageReceivedRating(ratings, 'unrated-user'), null);
});