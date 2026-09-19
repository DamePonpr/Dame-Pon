import assert from 'node:assert/strict';
import test from 'node:test';
import { isRoleHomeAuthorized, routeForRole } from '../lib/roleRouting.js';

test('routes each known profile role to its own home panel', () => {
  assert.equal(routeForRole('pasajero'), '/(root)/(tabs)/home');
  assert.equal(routeForRole('conductor'), '/(root)/(tabs)/home');
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
    profileRole: 'pasajero',
    expectedRole: 'pasajero',
  };
  assert.equal(isRoleHomeAuthorized(passenger), true);
  assert.equal(isRoleHomeAuthorized({ ...passenger, expectedRole: 'conductor' }), false);
  assert.equal(isRoleHomeAuthorized({ ...passenger, isLoading: true }), false);
});

test('renders the driver panel only for a loaded matching driver profile', () => {
  const driver = {
    isLoading: false,
    userId: 'driver-user',
    profileId: 'driver-user',
    profileRole: 'conductor',
    expectedRole: 'conductor',
  };
  assert.equal(isRoleHomeAuthorized(driver), true);
  assert.equal(isRoleHomeAuthorized({ ...driver, expectedRole: 'pasajero' }), false);
});

test('switches passenger to driver and driver to passenger without reusing the prior role', () => {
  const passengerSession = {
    isLoading: false,
    userId: 'passenger-user',
    profileId: 'passenger-user',
    profileRole: 'pasajero',
  };
  const driverSession = {
    isLoading: false,
    userId: 'driver-user',
    profileId: 'driver-user',
    profileRole: 'conductor',
  };

  assert.equal(isRoleHomeAuthorized({ ...passengerSession, expectedRole: 'pasajero' }), true);
  assert.equal(isRoleHomeAuthorized({ ...passengerSession, expectedRole: 'conductor' }), false);
  assert.equal(isRoleHomeAuthorized({ ...driverSession, expectedRole: 'conductor' }), true);
  assert.equal(isRoleHomeAuthorized({ ...driverSession, expectedRole: 'pasajero' }), false);

  const loadingNextSession = { ...driverSession, isLoading: true, profileId: null, profileRole: null };
  assert.equal(isRoleHomeAuthorized({ ...loadingNextSession, expectedRole: 'pasajero' }), false);
  assert.equal(isRoleHomeAuthorized({ ...loadingNextSession, expectedRole: 'conductor' }), false);
});