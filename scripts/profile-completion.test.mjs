import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidPassengerPhone,
  isValidPhone,
  normalizePhoneForRole,
} from '../packages/shared/src/lib/profileCompletion.ts';

test('aplica 787/939 solamente a conductores', () => {
  assert.equal(isValidPhone('787-555-1234', 'conductor'), true);
  assert.equal(isValidPhone('+1 939 555 1234', 'conductor'), true);
  assert.equal(isValidPhone('212-555-1234', 'conductor'), false);
  assert.equal(normalizePhoneForRole('787-555-1234', 'conductor'), '+17875551234');
});

test('acepta teléfonos válidos de pasajeros y los normaliza con código de país', () => {
  assert.equal(isValidPassengerPhone('212-555-1234'), true);
  assert.equal(isValidPassengerPhone('+1 787 555 1234'), true);
  assert.equal(isValidPassengerPhone('+44 7911 123456'), true);
  assert.equal(normalizePhoneForRole('212-555-1234', 'pasajero'), '+12125551234');
  assert.equal(normalizePhoneForRole('+44 7911 123456', 'pasajero'), '+447911123456');
});

test('rechaza ceros, números cortos y prefijos inválidos', () => {
  for (const phone of ['0000000000', '123456789', '111-555-1234', '+999123456789']) {
    assert.equal(isValidPhone(phone, 'pasajero'), false, phone);
    assert.equal(isValidPhone(phone, 'conductor'), false, phone);
  }
});