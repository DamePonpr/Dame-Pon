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

test('renderiza el trazo del logo con assets correctos para ambos temas', () => {
  assert.match(component, /role\?: BrandLogoRole/);
  assert.match(component, /dame-pon-mark-navy\.png/);
  assert.match(component, /dame-pon-mark-white\.png/);
  assert.match(component, /source=\{colors\.isDark \? darkMark : lightMark\}/);
  assert.match(component, /resizeMode="contain"/);
  assert.doesNotMatch(component, /tintColor/);
  assert.match(component, /showDarkModeEdge/);
  assert.match(component, /LOGO_RADIUS_RATIO = 0\.22/);
  assert.ok(lightMark.length > 0);
  assert.ok(darkMark.length > 0);
});