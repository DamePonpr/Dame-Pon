import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';

const validator = new URL('./validate-supabase-config.mjs', import.meta.url);
const validUrl = 'https://example.supabase.co';
const validKey = 'sb_publishable_safe-test-value';

function runValidator(overrides = {}) {
  const env = {
    ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: validUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: validKey,
    ...overrides,
  };

  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) {
      delete env[name];
    }
  }

  return spawnSync(process.execPath, [validator.pathname], {
    env,
    encoding: 'utf8',
  });
}

function assertRejected(result, expectedMessage, rejectedKey) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, expectedMessage);
  assert.match(result.stderr, /EAS preview environment or eas\.json/);
  assert.match(result.stderr, /rebuild Dame Pon/);

  if (rejectedKey) {
    assert.doesNotMatch(result.stderr, new RegExp(rejectedKey));
    assert.doesNotMatch(result.stdout, new RegExp(rejectedKey));
  }
}

describe('Supabase startup configuration validation', () => {
  test('accepts an HTTPS URL and a Publishable key', () => {
    const result = runValidator();

    assert.equal(result.status, 0);
    assert.match(result.stdout, /configuration is valid/);
    assert.doesNotMatch(result.stdout, new RegExp(validKey));
  });

  test('rejects a missing Publishable key with actionable guidance', () => {
    const result = runValidator({
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    });

    assertRejected(result, /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing/);
    assert.match(result.stderr, /sb_publishable_/);
  });

  test('rejects a legacy JWT without printing it', () => {
    const rejectedKey = 'eyJ-not-safe-to-log';
    const result = runValidator({
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: rejectedKey,
    });

    assertRejected(result, /legacy JWT anon key/, rejectedKey);
    assert.match(result.stderr, /Replace it/);
  });

  test('rejects a secret key without printing it', () => {
    const rejectedKey = 'sb_secret_not-safe-to-log';
    const result = runValidator({
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: rejectedKey,
    });

    assertRejected(result, /secret key/, rejectedKey);
    assert.match(result.stderr, /must never be exposed to a mobile app/);
  });

  test('rejects an unknown key prefix without printing it', () => {
    const rejectedKey = 'unknown_not-safe-to-log';
    const result = runValidator({
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: rejectedKey,
    });

    assertRejected(result, /beginning with sb_publishable_/, rejectedKey);
  });

  test('rejects an invalid URL with actionable guidance', () => {
    const result = runValidator({
      EXPO_PUBLIC_SUPABASE_URL: 'not-a-url',
    });

    assertRejected(result, /EXPO_PUBLIC_SUPABASE_URL is not a valid URL/);
  });
});