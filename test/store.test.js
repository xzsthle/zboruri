import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStore } from '../src/store.js';
import { emptyState } from '../src/state.js';

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'zboruri-'));
  const paths = { statePath: join(dir, 'data', 'state.json'), siteDataPath: join(dir, 'docs', 'data', 'deals.json') };
  return { paths, store: createFileStore(paths) };
}

test('readState returns an empty state when no file exists yet', async () => {
  const { store } = await tempStore();
  assert.deepEqual(await store.readState(), emptyState());
});

test('writeState and writeSiteData create folders and round-trip JSON', async () => {
  const { store, paths } = await tempStore();
  const state = { version: 2, destinations: { BUD: { priceEur: 37, since: 'x', alerted: true } } };
  await store.writeState(state);
  await store.writeSiteData({ hello: 'world' });
  assert.deepEqual(await store.readState(), state);
  assert.equal(await readFile(paths.siteDataPath, 'utf8'), '{\n  "hello": "world"\n}\n');
});

test('readState explains how to recover from a corrupt file', async () => {
  const { store, paths } = await tempStore();
  await store.writeState(emptyState());
  await writeFile(paths.statePath, '{not json');
  await assert.rejects(store.readState(), /is not valid JSON.*delete it to reset/);
});
