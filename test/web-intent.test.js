import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intentToRoute, sanitizeIntent } from '../docs/js/intent.js';
import { parseHash, toHash, departSpec } from '../docs/js/query.js';
import { createEngine } from '../docs/js/engine.js';
import { DEFAULT_FILTERS, DEFAULT_QUERY } from '../docs/js/query.js';

const TODAY = '2026-09-30';
const rules = { minNights: 2, maxNights: 10 };
const valid = new Set(['ALC', 'LCA', 'BUD', 'SOF']);

test('sanitizeIntent keeps only known airports, sane dates and clamped numbers', () => {
  const intent = sanitizeIntent({
    language: 'xx',
    destinations: ['ALC', 'ZZZ', 'alc', 'LCA', 'ALC'],
    label: 'Beach destinations'.repeat(10),
    departFrom: '2026-10-11',
    departTo: '2026-10-05',
    minNights: 40,
    maxNights: -3,
    weekendOnly: 'yes',
    maxPricePerPersonEur: 80,
    adults: 20,
    sort: 'random',
    reply: 'Beach trips next week.',
  }, { today: TODAY, validIatas: valid });
  assert.equal(intent.language, 'en');
  assert.deepEqual(intent.destinations, ['ALC', 'LCA']);
  assert.equal(intent.label.length, 60);
  assert.deepEqual([intent.departFrom, intent.departTo], ['2026-10-05', '2026-10-11'], 'swapped into order');
  assert.deepEqual([intent.minNights, intent.maxNights], [30, 30]);
  assert.equal(intent.weekendOnly, false, 'only a real boolean counts');
  assert.equal(intent.maxPrice, 80);
  assert.equal(intent.adults, 9);
  assert.equal(intent.sort, 'best');
});

test('sanitizeIntent drops past or far-future dates and junk types', () => {
  const intent = sanitizeIntent({ departFrom: '2026-09-01', departTo: '2028-01-01', destinations: 'ALC', reply: 42 }, { today: TODAY, validIatas: valid });
  assert.deepEqual([intent.departFrom, intent.departTo], ['', '']);
  assert.deepEqual(intent.destinations, []);
  assert.equal(intent.reply, '');
  const single = sanitizeIntent({ departFrom: '2026-10-24' }, { today: TODAY, validIatas: valid });
  assert.deepEqual([single.departFrom, single.departTo], ['2026-10-24', '2026-10-24']);
});

test('intentToRoute turns an intent into a search query and filters', () => {
  const route = intentToRoute(sanitizeIntent({
    destinations: ['ALC', 'LCA'], label: 'Beach destinations', departFrom: '2026-10-05', departTo: '2026-10-11',
    minNights: 1, maxNights: 0, weekendOnly: true, maxPrice: 80, adults: 2, sort: 'cheapest', reply: 'Beach trips next week under €80.',
  }, { today: TODAY, validIatas: valid }), rules);
  assert.deepEqual(route.query, {
    ...DEFAULT_QUERY, to: 'ALC,LCA', depart: '2026-10-05..2026-10-11', min: 2, max: 2, adults: 2,
    label: 'Beach destinations', note: 'Beach trips next week under €80.',
  });
  assert.deepEqual(route.filters, { ...DEFAULT_FILTERS, sort: 'cheapest', maxPrice: 80, weekend: true });
});

test('intentToRoute recognises whole months, single days and single destinations', () => {
  const month = intentToRoute(sanitizeIntent({ destinations: ['BUD'], departFrom: '2026-11-01', departTo: '2026-11-30' }, { today: TODAY, validIatas: valid }), rules);
  assert.equal(month.query.to, 'BUD');
  assert.equal(month.query.depart, '2026-11');
  assert.deepEqual([month.query.min, month.query.max], [2, 10]);
  const day = intentToRoute(sanitizeIntent({ departFrom: '2026-10-24', minNights: 5 }, { today: TODAY, validIatas: valid }), rules);
  assert.equal(day.query.to, 'anywhere');
  assert.equal(day.query.depart, '2026-10-24');
  assert.deepEqual([day.query.min, day.query.max], [5, 5]);
});

test('the URL keeps date ranges, destination lists and the AI label/note (length-capped)', () => {
  const query = { ...DEFAULT_QUERY, to: 'ALC,LCA', depart: '2026-10-05..2026-10-11', label: 'Beach', note: 'Beach trips next week.' };
  const parsed = parseHash(toHash(query, DEFAULT_FILTERS), rules);
  assert.deepEqual(parsed.query, query);
  assert.deepEqual(departSpec('2026-10-05..2026-10-11'), { type: 'range', from: '2026-10-05', to: '2026-10-11' });
  const junk = parseHash(`#/search?to=ALC,<x>,LCA&depart=2026-10-11..2026-10-05&label=${'a'.repeat(200)}`, rules);
  assert.equal(junk.query.to, 'ALC,LCA');
  assert.equal(junk.query.depart, 'anytime', 'a backwards range is rejected');
  assert.equal(junk.query.label.length, 60);
});

test('the engine searches a date range and a list of destinations', () => {
  const site = { origin: { iata: 'RMO' }, destinations: [{ iata: 'ALC', name: 'Alicante' }, { iata: 'LCA', name: 'Larnaca' }, { iata: 'BUD', name: 'Budapest' }] };
  const legs = (out, back, eur) => ({ out: [[out, ['10:00'], eur]], back: [[back, ['12:00'], eur]], cached: [] });
  const engine = createEngine(site, { destinations: { ALC: legs('2026-10-06', '2026-10-09', 20), LCA: legs('2026-10-20', '2026-10-23', 10), BUD: legs('2026-10-07', '2026-10-10', 5) } });
  const q = { ...DEFAULT_QUERY, to: 'ALC,LCA', depart: '2026-10-05..2026-10-11' };
  assert.deepEqual(engine.explore(q, DEFAULT_FILTERS).map((row) => row.dest.iata), ['ALC'], 'LCA is outside the dates, BUD is not in the list');
  assert.deepEqual([...engine.pricesByDepartDay(q).keys()].sort(), ['2026-10-06', '2026-10-20']);
});
