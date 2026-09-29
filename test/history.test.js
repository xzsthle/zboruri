import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyHistory, HISTORY_DAYS, normalizeHistory, updateHistory } from '../src/history.js';

test('normalizeHistory keeps a valid history and resets anything else', () => {
  const valid = { version: 1, destinations: { BUD: [['2026-09-29', 40]] } };
  assert.deepEqual(normalizeHistory(valid), valid);
  assert.deepEqual(normalizeHistory({ destinations: [] }), emptyHistory());
  assert.deepEqual(normalizeHistory(null), emptyHistory());
});

test('updateHistory appends today and keeps the lowest price seen that day', () => {
  const morning = updateHistory(emptyHistory(), { BUD: 40 }, '2026-09-29');
  const evening = updateHistory(morning, { BUD: 45 }, '2026-09-29');
  const nextDay = updateHistory(evening, { BUD: 38 }, '2026-09-30');
  assert.deepEqual(evening.destinations.BUD, [['2026-09-29', 40]]);
  assert.deepEqual(nextDay.destinations.BUD, [['2026-09-29', 40], ['2026-09-30', 38]]);
  assert.deepEqual(morning.destinations.BUD, [['2026-09-29', 40]], 'input must not be mutated');
});

test('updateHistory keeps destinations that were not priced today and trims old days', () => {
  const long = Array.from({ length: HISTORY_DAYS }, (_, i) => [`2026-07-${String(i + 1).padStart(2, '0')}`, 50]);
  const history = { version: 1, destinations: { BUD: long, HAM: [['2026-09-28', 70]] } };
  const next = updateHistory(history, { BUD: 41 }, '2026-09-29');
  assert.equal(next.destinations.BUD.length, HISTORY_DAYS);
  assert.deepEqual(next.destinations.BUD.at(-1), ['2026-09-29', 41]);
  assert.deepEqual(next.destinations.HAM, [['2026-09-28', 70]]);
});
