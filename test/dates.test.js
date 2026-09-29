import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, dateWindows, parseIsoDate, toIsoDate } from '../src/dates.js';

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
});

test('daysBetween counts nights, including across a DST change', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-05'), 4);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
});

test('parseIsoDate rejects malformed dates', () => {
  assert.throws(() => parseIsoDate('01/10/2026'), /Invalid date/);
  assert.throws(() => parseIsoDate(undefined), /Invalid date/);
});

test('toIsoDate formats a timestamp as YYYY-MM-DD in UTC', () => {
  assert.equal(toIsoDate(Date.UTC(2026, 9, 5, 23, 59)), '2026-10-05');
});

test('dateWindows splits the range into spans no longer than the max', () => {
  assert.deepEqual(dateWindows('2026-10-01', 100, 42), [
    { from: '2026-10-01', to: '2026-11-11' },
    { from: '2026-11-12', to: '2026-12-23' },
    { from: '2026-12-24', to: '2027-01-08' },
  ]);
});

test('dateWindows returns a single window for short ranges', () => {
  assert.deepEqual(dateWindows('2026-10-01', 10, 42), [{ from: '2026-10-01', to: '2026-10-10' }]);
});
