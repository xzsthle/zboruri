import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, markAlerted, normalizeState, selectAlerts, updateState } from '../src/state.js';

const entry = (priceEur, alerted = true, since = 'old') => ({ priceEur, since, alerted });

test('normalizeState keeps a valid state and resets anything else', () => {
  const valid = { version: 2, destinations: { BUD: entry(40) } };
  assert.deepEqual(normalizeState(valid), valid);
  assert.deepEqual(normalizeState({ version: 1, deals: {} }), emptyState());
  assert.deepEqual(normalizeState({ version: 2, destinations: [] }), emptyState());
  assert.deepEqual(normalizeState(null), emptyState());
});

test('updateState records destinations that newly have deals', () => {
  const next = updateState(emptyState(), { bestPrices: { BUD: 37 }, failed: [], nowIso: 'now' });
  assert.deepEqual(next.destinations, { BUD: { priceEur: 37, since: 'now', alerted: false } });
});

test('updateState keeps the record when the price is the same, higher, or less than €1 lower', () => {
  const state = { version: 2, destinations: { A: entry(40), B: entry(40), C: entry(40) } };
  const next = updateState(state, { bestPrices: { A: 40, B: 52, C: 39.4 }, failed: [], nowIso: 'now' });
  assert.deepEqual(next.destinations, { A: entry(40), B: entry(40), C: entry(40) });
});

test('updateState starts a fresh, unalerted record when a destination gets at least €1 cheaper', () => {
  const next = updateState({ version: 2, destinations: { A: entry(40) } }, { bestPrices: { A: 39 }, failed: [], nowIso: 'now' });
  assert.deepEqual(next.destinations.A, { priceEur: 39, since: 'now', alerted: false });
});

test('updateState forgets destinations without deals but keeps ones that failed to scan', () => {
  const state = { version: 2, destinations: { GONE: entry(40), FAILED: entry(45) } };
  const next = updateState(state, { bestPrices: {}, failed: ['FAILED', 'NEVER_SEEN'], nowIso: 'now' });
  assert.deepEqual(next.destinations, { FAILED: entry(45) });
  assert.ok('GONE' in state.destinations, 'input state must not be mutated');
});

test('selectAlerts returns unalerted destinations that have deals right now', () => {
  const state = { version: 2, destinations: { A: entry(40, false), B: entry(40, true), C: entry(40, false) } };
  assert.deepEqual(selectAlerts(state, ['A', 'B']), ['A']);
});

test('markAlerted flags destinations as sent without mutating the input', () => {
  const state = { version: 2, destinations: { A: entry(40, false), B: entry(40, false) } };
  const next = markAlerted(state, ['A', 'Z']);
  assert.deepEqual(next.destinations, { A: entry(40, true), B: entry(40, false) });
  assert.equal(state.destinations.A.alerted, false);
});
