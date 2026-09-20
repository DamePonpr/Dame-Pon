import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL('../../../packages/shared/src/components/BrandLogo.tsx', import.meta.url);
const passengerMarkPath = new URL('../../../packages/shared/src/assets/dame-pon-mark-white.png', import.meta.url);
const driverMarkPath = new URL('../../../packages/shared/src/assets/dame-pon-mark-navy.png', import.meta.url);

const [component, passengerMark, driverMark] = await Promise.all([
  readFile(componentPath, 'utf8'),
  readFile(passengerMarkPath),
  readFile(driverMarkPath),
]);

test('selecciona el trazo correcto según la aplicación', () => {
  assert.match(component, /passengerMark/);
  assert.match(component, /driverMark/);
  assert.match(component, /damePonRole/);
  assert.match(component, /role === 'conductor'/);
  assert.match(component, /overflow: 'hidden'/);
  assert.ok(passengerMark.length > 0);
  assert.ok(driverMark.length > 0);
});