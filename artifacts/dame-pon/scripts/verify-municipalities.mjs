import assert from 'node:assert/strict';
import test from 'node:test';
import {
  municipalityAfterDecision,
  nearestMunicipality,
  sortTripsForDriver,
} from '../lib/municipality.ts';

const municipalities = [
  { id: 'san-juan', nombre: 'San Juan', centro_lat: 18.4655, centro_lng: -66.1057 },
  { id: 'ponce', nombre: 'Ponce', centro_lat: 18.0111, centro_lng: -66.6141 },
  { id: 'caguas', nombre: 'Caguas', centro_lat: 18.2341, centro_lng: -66.0485 },
];

function trip(id, municipality, latitude, longitude) {
  return {
    id,
    municipio_origen: municipality,
    pickup_lat: latitude,
    pickup_lng: longitude,
  };
}

test('detecta el municipio más cercano por coordenadas', () => {
  const nearest = nearestMunicipality(
    { latitude: 18.466, longitude: -66.106 },
    municipalities,
  );
  assert.equal(nearest?.nombre, 'San Juan');
});

test('ordena primero el pueblo activo y después por cercanía', () => {
  const ordered = sortTripsForDriver(
    [
      trip('far-local', 'San Juan', 18.52, -66.25),
      trip('near-other', 'Caguas', 18.25, -66.05),
      trip('near-local', 'San Juan', 18.46, -66.11),
    ],
    'San Juan',
    { latitude: 18.4655, longitude: -66.1057 },
  );
  assert.deepEqual(ordered.map(({ id }) => id), ['near-local', 'far-local', 'near-other']);
});

test('la decisión de regresar restaura la base y quedarse activa el destino', () => {
  assert.equal(municipalityAfterDecision('return', 'San Juan', 'Ponce'), 'San Juan');
  assert.equal(municipalityAfterDecision('stay', 'San Juan', 'Ponce'), 'Ponce');
});