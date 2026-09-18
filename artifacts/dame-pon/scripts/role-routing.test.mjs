import assert from 'node:assert/strict';
import test from 'node:test';
import { isRoleHomeAuthorized, routeForRole } from '../lib/roleRouting.js';

test('routes each known profile role to its own home panel', () => {
  assert.equal(routeForRole('passenger'), '/home/passenger');
  assert.equal(routeForRole('driver'), '/home/driver');
});

test('never defaults an unknown role to a panel', () => {
  assert.equal(routeForRole(null), null);
  assert.equal(routeForRole(undefined), null);
  assert.equal(routeForRole('admin'), null);
});

test('renders the passenger panel only for a loaded matching passenger profile', () => {
  const passenger = {
    isLoading: false,
    userId: 'passenger-user',
    profileId: 'passenger-user',
    profileRole: 'passenger',
    expectedRole: 'passenger',
  };
  assert.equal(isRoleHomeAuthorized(passenger), true);
  assert.equal(isRoleHomeAuthorized({ ...passenger, expectedRole: 'driver' }), false);
  assert.equal(isRoleHomeAuthorized({ ...passenger, isLoading: true }), false);
});

test('renders the driver panel only for a loaded matching driver profile', () => {
  const driver = {
    isLoading: false,
    userId: 'driver-user',
    profileId: 'driver-user',
    profileRole: 'driver',
    expectedRole: 'driver',
  };
  assert.equal(isRoleHomeAuthorized(driver), true);
  assert.equal(isRoleHomeAuthorized({ ...driver, expectedRole: 'passenger' }), false);
});

test('switches passenger to driver and driver to passenger without reusing the prior role', () => {
  const passengerSession = {
    isLoading: false,
    userId: 'passenger-user',
    profileId: 'passenger-user',
    profileRole: 'passenger',
  };
  const driverSession = {
    isLoading: false,
    userId: 'driver-user',
    profileId: 'driver-user',
    profileRole: 'driver',
  };

  assert.equal(isRoleHomeAuthorized({ ...passengerSession, expectedRole: 'passenger' }), true);
  assert.equal(isRoleHomeAuthorized({ ...passengerSession, expectedRole: 'driver' }), false);
  assert.equal(isRoleHomeAuthorized({ ...driverSession, expectedRole: 'driver' }), true);
  assert.equal(isRoleHomeAuthorized({ ...driverSession, expectedRole: 'passenger' }), false);

  const loadingNextSession = { ...driverSession, isLoading: true, profileId: null, profileRole: null };
  assert.equal(isRoleHomeAuthorized({ ...loadingNextSession, expectedRole: 'passenger' }), false);
  assert.equal(isRoleHomeAuthorized({ ...loadingNextSession, expectedRole: 'driver' }), false);
});