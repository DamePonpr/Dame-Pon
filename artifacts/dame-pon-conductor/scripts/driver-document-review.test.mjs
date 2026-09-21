import assert from 'node:assert/strict';
import test from 'node:test';
import { subscribeToDriverDocumentReview } from '../../../packages/shared/src/lib/driverDocumentReviewRealtime.ts';

test('registra todos los listeners antes de subscribe y limpia el mismo canal', () => {
  const calls = [];
  let subscribed = false;
  let removedChannel = null;
  let subscribeCallback = null;
  const fakeChannel = {
    on(event, filter, callback) {
      if (subscribed) throw new Error('on() fue llamado después de subscribe()');
      calls.push({ event, filter, callback });
      return this;
    },
    subscribe(callback) {
      subscribed = true;
      subscribeCallback = callback;
      return this;
    },
  };
  const client = {
    channel(name) {
      calls.push({ name });
      return fakeChannel;
    },
    removeChannel(channel) {
      removedChannel = channel;
      return Promise.resolve('ok');
    },
  };
  let refreshes = 0;

  const cleanup = subscribeToDriverDocumentReview(client, 'driver-123', () => {
    refreshes += 1;
  });

  assert.match(calls[0].name, /^driver-document-review:driver-123:\d+$/);
  assert.equal(calls.filter((call) => call.event === 'postgres_changes').length, 2);
  assert.equal(subscribed, true);
  subscribeCallback('SUBSCRIBED');
  assert.equal(refreshes, 1);

  cleanup();
  assert.equal(removedChannel, fakeChannel);
});