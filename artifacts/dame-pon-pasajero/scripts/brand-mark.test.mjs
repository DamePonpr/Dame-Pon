import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL('../../../packages/shared/src/components/BrandLogo.tsx', import.meta.url);
const markPath = new URL('../../../packages/shared/src/assets/dame-pon-mark-passenger-tile.png', import.meta.url);

const [component, mark] = await Promise.all([
  readFile(componentPath, 'utf8'),
  readFile(markPath),
]);

test('renderiza el cuadro pasajero con trazo blanco y borde oscuro sutil', () => {
  assert.match(component, /role\?: BrandLogoRole/);
  assert.match(component, /dame-pon-mark-passenger-tile\.png/);
  assert.match(component, /backgroundColor: isPassenger \? '#081321' : '#FFFFFF'/);
  assert.match(component, /showDarkModeEdge/);
  assert.match(component, /LOGO_RADIUS_RATIO = 0\.22/);
  assert.ok(mark.length > 0);
});