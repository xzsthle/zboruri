import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStore } from '../src/store.js';
import { emptyState } from '../src/state.js';
import { emptyHistory } from '../src/history.js';

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'zboruri-'));
  const paths = {
    statePath: join(dir, 'data', 'state.json'),
    siteDataPath: join(dir, 'docs', 'data', 'deals.json'),
    historyPath: join(dir, 'docs', 'data', 'history.json'),
  };
  return { paths, store: createFileStore(paths) };
}

test('readState and readHistory start empty when no file exists yet', async () => {
  const { store } = await tempStore();
  assert.deepEqual(await store.readState(), emptyState());
  assert.deepEqual(await store.readHistory(), emptyHistory());
});

test('the store creates folders and round-trips state, history and site data', async () => {
  const { store, paths } = await tempStore();
  const state = { version: 2, destinations: { BUD: { priceEur: 37, since: 'x', alerted: true } } };
  const history = { version: 1, destinations: { BUD: [['2026-09-29', 37]] } };
  await store.writeState(state);
  await store.writeHistory(history);
  await store.writeSiteData({ hello: 'world' });
  assert.deepEqual(await store.readState(), state);
  assert.deepEqual(await store.readHistory(), history);
  assert.equal(await readFile(paths.siteDataPath, 'utf8'), '{"hello":"world"}\n', 'site data is compact to keep downloads small');
  assert.match(await readFile(paths.statePath, 'utf8'), /^\{\n {2}"version": 2/, 'state stays readable in diffs');
});

test('readState explains how to recover from a corrupt file', async () => {
  const { store, paths } = await tempStore();
  await store.writeState(emptyState());
  await writeFile(paths.statePath, '{not json');
  await assert.rejects(store.readState(), /is not valid JSON.*delete it to reset/);
});
