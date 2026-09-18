import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const nativeMapPath = new URL('../components/LiveRideMap.native.tsx', import.meta.url);
const appConfigPath = new URL('../app.json', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);
const roleHomePath = new URL('../components/RoleHome.tsx', import.meta.url);

const [nativeMap, appConfigText, packageText, roleHome] = await Promise.all([
  readFile(nativeMapPath, 'utf8'),
  readFile(appConfigPath, 'utf8'),
  readFile(packagePath, 'utf8'),
  readFile(roleHomePath, 'utf8'),
]);

const appConfig = JSON.parse(appConfigText);
const packageJson = JSON.parse(packageText);

test('usa MapLibre con estilos OpenFreeMap sin llaves', () => {
  assert.match(nativeMap, /@maplibre\/maplibre-react-native/);
  assert.match(nativeMap, /https:\/\/tiles\.openfreemap\.org\/styles\/bright/);
  assert.match(nativeMap, /https:\/\/tiles\.openfreemap\.org\/styles\/dark/);
  assert.doesNotMatch(nativeMap, /googleMaps|apiKey|react-native-maps/);
  assert.ok(
    appConfig.expo.plugins.some((plugin) => (
      Array.isArray(plugin) && plugin[0] === '@maplibre/maplibre-react-native'
    )),
    'el plugin de Expo de MapLibre debe estar configurado',
  );
  assert.equal(packageJson.dependencies['react-native-maps'], undefined);
});

test('los marcadores no salen del viaje activo que recibe el componente', () => {
  assert.match(nativeMap, /id="passenger-location"[\s\S]*toLngLat\(passengerLocation\)/);
  assert.match(nativeMap, /id="pickup-location"[\s\S]*toLngLat\(pickupLocation\)/);
  assert.match(nativeMap, /id="assigned-driver-location"[\s\S]*toLngLat\(driverLocation\)/);
  assert.doesNotMatch(nativeMap, /getOpenTrips|getDriverSetup|drivers\.select/);
});

test('el panel del conductor también muestra el mapa durante el viaje', () => {
  assert.match(roleHome, /driverLocation=\{driverMapLocation\}/);
  assert.match(
    roleHome,
    /<LiveRideMap[\s\S]*passengerLocation=\{null\}[\s\S]*driverLocation=\{driverLocation\}[\s\S]*pickupLocation=\{pickupLocation\}/,
  );
  assert.match(roleHome, /El pasajero puede seguir tu llegada en el mapa/);
});