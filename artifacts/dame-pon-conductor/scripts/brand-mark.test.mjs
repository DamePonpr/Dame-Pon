import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL('../../../packages/shared/src/components/BrandLogo.tsx', import.meta.url);
const lightMarkPath = new URL('../../../packages/shared/src/assets/dame-pon-mark-navy.png', import.meta.url);
const darkMarkPath = new URL('../../../packages/shared/src/assets/dame-pon-mark-white.png', import.meta.url);

const [component, lightMark, darkMark] = await Promise.all([
  readFile(componentPath, 'utf8'),
  readFile(lightMarkPath),
  readFile(darkMarkPath),
]);

test('selecciona el trazo correcto según el tema', () => {
  assert.match(component, /lightMark/);
  assert.match(component, /darkMark/);
  assert.match(component, /source=\{colors\.isDark \? darkMark : lightMark\}/);
  assert.match(component, /resizeMode="contain"/);
  assert.doesNotMatch(component, /tintColor/);
  assert.match(component, /damePonRole/);
  assert.match(component, /configuredRole === 'conductor'/);
  assert.match(component, /overflow: 'hidden'/);
  assert.ok(lightMark.length > 0);
  assert.ok(darkMark.length > 0);
});