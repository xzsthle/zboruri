import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, validateConfig } from '../src/config.js';

const valid = {
  origin: 'RMO', maxReturnPriceEur: 60, minNights: 2, maxNights: 10, daysAhead: 120, maxDealsPerDestination: 5, requestDelayMs: 0,
};

test('the shipped config.json is valid', async () => {
  const raw = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateConfig(raw));
});

test('validateConfig lists every invalid field in one error', () => {
  assert.throws(() => validateConfig({ ...valid, origin: 'rmo', maxReturnPriceEur: -1, daysAhead: undefined }), (err) => {
    assert.match(err.message, /"origin"/);
    assert.match(err.message, /"maxReturnPriceEur"/);
    assert.match(err.message, /"daysAhead"/);
    assert.doesNotMatch(err.message, /"minNights"/);
    return true;
  });
});

test('validateConfig rejects minNights greater than maxNights', () => {
  assert.throws(() => validateConfig({ ...valid, minNights: 7, maxNights: 3 }), /"minNights" must be <= "maxNights"/);
});

test('validateConfig rejects a non-object', () => {
  assert.throws(() => validateConfig(null), /Invalid config/);
});

test('loadConfig reads, validates and freezes the file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zboruri-'));
  const file = join(dir, 'config.json');
  await writeFile(file, JSON.stringify(valid));
  const config = await loadConfig(file);
  assert.deepEqual(config, valid);
  assert.ok(Object.isFrozen(config));
});
