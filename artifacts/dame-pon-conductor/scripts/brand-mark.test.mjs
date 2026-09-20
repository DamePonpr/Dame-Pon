import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL('../../../packages/shared/src/components/BrandLogo.tsx', import.meta.url);
const passengerLogoPath = new URL('../../../packages/shared/src/assets/dame-pon-logo-passenger.png', import.meta.url);
const driverLogoPath = new URL('../../../packages/shared/src/assets/dame-pon-logo-driver.png', import.meta.url);

const [component, passengerLogo, driverLogo] = await Promise.all([
  readFile(componentPath, 'utf8'),
  readFile(passengerLogoPath),
  readFile(driverLogoPath),
]);

test('selecciona el logo exacto según la aplicación', () => {
  assert.match(component, /passengerLogo/);
  assert.match(component, /driverLogo/);
  assert.match(component, /damePonRole/);
  assert.match(component, /role === 'conductor'/);
  assert.ok(passengerLogo.length > 0);
  assert.ok(driverLogo.length > 0);
});