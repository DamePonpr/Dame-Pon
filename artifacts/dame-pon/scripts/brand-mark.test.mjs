import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL('../components/BrandMark.tsx', import.meta.url);
const lightLogoPath = new URL('../assets/images/dame-pon-logo.png', import.meta.url);
const darkLogoPath = new URL('../assets/images/dame-pon-logo-dark.png', import.meta.url);

const [component, lightLogo, darkLogo] = await Promise.all([
  readFile(componentPath, 'utf8'),
  readFile(lightLogoPath),
  readFile(darkLogoPath),
]);

test('elige una variante de logo con contraste para cada tema', () => {
  assert.match(component, /colors\.isDark/);
  assert.match(component, /dame-pon-logo-dark\.png/);
  assert.match(component, /dame-pon-logo\.png/);
  assert.ok(lightLogo.length > 0);
  assert.ok(darkLogo.length > 0);
  assert.notDeepEqual(lightLogo, darkLogo);
});