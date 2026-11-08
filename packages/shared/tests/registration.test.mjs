import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareRegistration, registrationErrorMessage } from '../src/lib/profileCompletion.ts';
import { isHomeAuthorized } from '../src/lib/roleRouting.ts';

const valid = {
  email: ' test@example.invalid ',
  password: 'segura-123',
  fullName: ' Persona de prueba ',
  phone: '787-555-1234',
  role: 'conductor',
  baseMunicipality: ' San Juan ',
};

function backend({ municipality = 'San Juan', catalogError = null, available = true, phoneError = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      assert.equal(table, 'municipios', 'El registro solo debe consultar el catálogo.');
      return {
        select(columns) {
          assert.equal(columns, 'nombre');
          return {
            eq(column, value) {
              calls.push(['municipality', column, value]);
              return {
                async maybeSingle() {
                  return { data: municipality === null ? null : { nombre: municipality }, error: catalogError };
                },
              };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      assert.equal(name, 'is_phone_available');
      return { data: available, error: phoneError };
    },
  };
}

test('pasajero: rol fijo, normalización y ningún municipio en los metadatos', async () => {
  const client = backend();
  const result = await prepareRegistration(client, { ...valid, role: 'pasajero', phone: '212-555-1234' }, 'pasajero');
  assert.equal(result.error, null);
  assert.deepEqual(result.request, {
    email: 'test@example.invalid',
    password: 'segura-123',
    options: { data: { full_name: 'Persona de prueba', phone: '+12125551234', role: 'pasajero' } },
  });
  assert.equal(client.calls.some(([kind]) => kind === 'from'), false);
});

test('conductor: rol fijo y municipio comprobado contra el catálogo', async () => {
  const client = backend();
  const result = await prepareRegistration(client, valid, 'conductor');
  assert.equal(result.error, null);
  assert.equal(result.request.options.data.role, 'conductor');
  assert.equal(result.request.options.data.base_municipality, 'San Juan');
  assert.deepEqual(client.calls[1], ['municipality', 'nombre', 'San Juan']);
});

test('ambas apps rechazan el rol cruzado antes de consultar o crear datos', async () => {
  for (const [role, appRole] of [['pasajero', 'conductor'], ['conductor', 'pasajero'], ['admin', 'pasajero']]) {
    const client = backend();
    const result = await prepareRegistration(client, { ...valid, role }, appRole);
    assert.equal(result.error, 'REGISTRATION_ROLE_MISMATCH');
    assert.equal(result.request, null);
    assert.deepEqual(client.calls, []);
  }
});

test('conductor: municipio obligatorio, sin valores arbitrarios ni errores de catálogo silenciosos', async () => {
  for (const baseMunicipality of [undefined, '', '   ', null, {}, 'a'.repeat(101)]) {
    const client = backend();
    const result = await prepareRegistration(client, { ...valid, baseMunicipality }, 'conductor');
    assert.equal(result.error, 'INVALID_BASE_MUNICIPALITY');
    assert.deepEqual(client.calls, []);
  }
  const unknown = await prepareRegistration(backend({ municipality: null }), { ...valid, baseMunicipality: 'Inventado' }, 'conductor');
  assert.equal(unknown.error, 'INVALID_BASE_MUNICIPALITY');
  const failing = backend({ catalogError: { message: 'sin conexión' } });
  assert.equal((await prepareRegistration(failing, valid, 'conductor')).error, 'MUNICIPALITY_UNAVAILABLE');
  assert.equal(failing.calls.some(([kind]) => kind === 'rpc'), false);
});

test('conductor: normaliza Unicode sin inventar municipios', async () => {
  const result = await prepareRegistration(
    backend({ municipality: 'Mayagüez' }),
    { ...valid, baseMunicipality: ' Mayagu\u0308ez ' },
    'conductor',
  );
  assert.equal(result.error, null);
  assert.equal(result.request.options.data.base_municipality, 'Mayagüez');
});

test('teléfono por rol: conductores PR 787/939, pasajeros nacionales e internacionales', async () => {
  for (const phone of ['787-555-1234', '+1 939 555 1234']) {
    assert.equal((await prepareRegistration(backend(), { ...valid, phone }, 'conductor')).error, null);
  }
  for (const phone of ['212-555-1234', '0000000000', '787-000-0000', '123']) {
    assert.equal((await prepareRegistration(backend(), { ...valid, phone }, 'conductor')).error, 'INVALID_PHONE');
  }
  assert.equal((await prepareRegistration(backend(), { ...valid, role: 'pasajero', phone: '+34 612 345 678' }, 'pasajero')).error, null);
});

test('campos básicos inválidos bloquean el registro antes de cualquier consulta', async () => {
  for (const [field, value, error] of [
    ['fullName', '  ', 'INVALID_FULL_NAME'],
    ['email', 'invalido', 'INVALID_EMAIL'],
    ['email', 'a b@example.invalid', 'INVALID_EMAIL'],
    ['password', '12345', 'INVALID_PASSWORD'],
  ]) {
    const client = backend();
    assert.equal((await prepareRegistration(client, { ...valid, [field]: value }, 'conductor')).error, error);
    assert.deepEqual(client.calls, []);
  }
});

test('teléfono duplicado o verificación incierta no producen solicitud de alta', async () => {
  for (const [options, expected] of [
    [{ available: false }, 'PHONE_ALREADY_REGISTERED'],
    [{ available: null }, 'PHONE_CHECK_UNAVAILABLE'],
    [{ phoneError: { message: 'error de permisos' } }, 'error de permisos'],
  ]) {
    const result = await prepareRegistration(backend(options), valid, 'conductor');
    assert.equal(result.error, expected);
    assert.equal(result.request, null);
  }
  assert.match(registrationErrorMessage('INVALID_PHONE', 'conductor'), /787 o 939/);
  assert.match(registrationErrorMessage('MUNICIPALITY_UNAVAILABLE', 'conductor'), /vuelve a intentarlo/);
});

test('barrera: roles cruzados, hidratación y perfiles de otra sesión nunca autorizan', () => {
  for (const role of ['pasajero', 'conductor']) {
    const input = { isLoading: false, userId: 'actual', profileId: 'actual', profileRole: role, expectedRole: role };
    assert.equal(isHomeAuthorized(input), true);
    for (const override of [
      { isLoading: true }, { userId: null }, { profileId: 'anterior' },
      { profileId: null }, { profileRole: null }, { profileRole: 'admin' },
      { expectedRole: role === 'conductor' ? 'pasajero' : 'conductor' },
    ]) {
      assert.equal(isHomeAuthorized({ ...input, ...override }), false);
    }
  }
});

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('las pantallas y providers fijan el rol por app sin selector cruzado', () => {
  for (const role of ['pasajero', 'conductor']) {
    const base = `../../../artifacts/dame-pon-${role}/app/`;
    const signup = source(`${base}(auth)/sign-up.tsx`);
    assert.ok(signup.includes(`const role = "${role}" as const`));
    assert.doesNotMatch(signup, /setRole|Quiero usar Dame Pon como/);
    assert.match(signup, /placeholder="787-000-0000"/);
    assert.ok(source(`${base}_layout.tsx`).includes(`<AuthProvider appRole="${role}">`));
    if (role === 'conductor') {
      assert.match(signup, /Municipio base \(obligatorio\)/);
      assert.match(signup, /if \(!form.baseMunicipality.trim\(\)\)/);
    } else {
      assert.doesNotMatch(signup, /MunicipalityPicker|baseMunicipality/);
    }
  }
});

test('las barreras cubren todo el grupo privado y el onboarding antes de montar contenido', () => {
  for (const role of ['pasajero', 'conductor']) {
    const base = `../../../artifacts/dame-pon-${role}/app/`;
    assert.ok(source(`${base}(root)/_layout.tsx`).includes(`<RoleAccessBoundary expectedRole="${role}">`));
    assert.ok(source(`${base}onboarding.tsx`).includes(`<RoleAccessBoundary expectedRole="${role}" requireOnboarding={false}>`));
  }
  const boundary = source('../src/components/RoleAccessBoundary.tsx');
  assert.match(boundary, /auth.profile.id !== auth.session.user.id/);
  assert.match(boundary, /isHomeAuthorized\(/);
  assert.match(boundary, /profile_unavailable/);
  assert.match(boundary, /requireOnboarding && !auth.profile.onboarding_completed/);
});

test('la fase no reescribe perfiles existentes, roles ni documentos de conductores', () => {
  const auth = source('../src/context/AuthContext.tsx');
  const ensureProfile = auth.slice(auth.indexOf('async function ensureProfile'), auth.indexOf('export function AuthProvider'));
  assert.match(ensureProfile, /if \(existing.data\) return null;/);
  assert.doesNotMatch(ensureProfile, /\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(ensureProfile, /base_municipality/);
  assert.doesNotMatch(auth, /\.from\(['"](?:drivers|driver_documents|vehicle_documents)['"]\)/);
  assert.match(auth, /prepareRegistration\(/);
  assert.match(auth, /supabase.auth.signUp\(prepared.request\)/);
  assert.match(auth, /if \(session\) return \{ error: 'ALREADY_SIGNED_IN'/);
});
