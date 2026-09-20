import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL('../components/BrandLogo.tsx', import.meta.url);
const lightLogoPath = new URL('../assets/images/dame-pon-logo.png', import.meta.url);

const [component, lightLogo] = await Promise.all([
  readFile(componentPath, 'utf8'),
  readFile(lightLogoPath),
]);

test('tinta el logo transparente según el tema activo', () => {
  assert.match(component, /colors\.isDark/);
  assert.match(component, /tintColor=\{colors\.isDark \? colors\.foreground : undefined\}/);
  assert.match(component, /dame-pon-logo\.png/);
  assert.ok(lightLogo.length > 0);
});