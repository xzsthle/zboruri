import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../docs/js/nl-parser.js';

const TODAY = '2026-09-30'; // a Wednesday
const destinations = [
  { iata: 'ALC', name: 'Alicante', country: 'Spain' },
  { iata: 'LCA', name: 'Larnaca', country: 'Cyprus' },
  { iata: 'RMI', name: 'Rimini', country: 'Italy' },
  { iata: 'NAP', name: 'Naples', country: 'Italy' },
  { iata: 'BGY', name: 'Milan Bergamo', country: 'Italy' },
  { iata: 'BUD', name: 'Budapest', country: 'Hungary' },
  { iata: 'GHV', name: 'Brasov', country: 'Romania' },
  { iata: 'LTN', name: 'London Luton', country: 'United Kingdom' },
  { iata: 'LGW', name: 'London Gatwick', country: 'United Kingdom' },
];
const rates = { EUR: 1, MDL: 20, RON: 5, USD: 1.1 };
const parse = (text) => parseQuery(text, { today: TODAY, destinations, rates });
const sorted = (list) => [...list].sort();

test('English: beach next week under €80', () => {
  const intent = parse('search for a flight next week to a beach destination under €80');
  assert.equal(intent.language, 'en');
  assert.deepEqual(sorted(intent.destinations), ['ALC', 'LCA', 'NAP', 'RMI']);
  assert.deepEqual([intent.departFrom, intent.departTo], ['2026-10-05', '2026-10-11']);
  assert.equal(intent.maxPrice, 80);
  assert.equal(intent.label, 'Beach destinations');
  assert.match(intent.reply, /beach/i);
});

test('Romanian: la mare săptămâna viitoare sub 1500 lei (lei are Moldovan lei)', () => {
  const intent = parse('zbor la mare săptămâna viitoare sub 1500 lei');
  assert.equal(intent.language, 'ro');
  assert.deepEqual(sorted(intent.destinations), ['ALC', 'LCA', 'NAP', 'RMI']);
  assert.deepEqual([intent.departFrom, intent.departTo], ['2026-10-05', '2026-10-11']);
  assert.equal(intent.maxPrice, 75);
  assert.equal(intent.label, 'Destinații la mare');
  assert.equal(intent.reply, 'Caut destinații la mare, săptămâna viitoare, sub 1500 lei.');
});

test('Romanian without diacritics: weekend in Italia pentru 2', () => {
  const intent = parse('weekend in italia pentru 2 persoane');
  assert.equal(intent.language, 'ro');
  assert.deepEqual(sorted(intent.destinations), ['BGY', 'NAP', 'RMI']);
  assert.equal(intent.weekendOnly, true);
  assert.equal(intent.adults, 2);
  assert.equal(intent.departFrom, '');
  assert.equal(intent.label, 'Italia', 'places are named the way they were typed');
});

test('themes combine with countries: beach in Italy', () => {
  assert.deepEqual(sorted(parse('beach in Italy').destinations), ['NAP', 'RMI']);
});

test('city break in November, 3 nights', () => {
  const intent = parse('city break in November, 3 nights');
  assert.ok(intent.destinations.includes('BUD'));
  assert.ok(!intent.destinations.includes('LCA'));
  assert.deepEqual([intent.departFrom, intent.departTo], ['2026-11-01', '2026-11-30']);
  assert.deepEqual([intent.minNights, intent.maxNights], [3, 3]);
});

test('Romanian city and month names: Londra în decembrie', () => {
  const intent = parse('Londra în decembrie');
  assert.deepEqual(sorted(intent.destinations), ['LGW', 'LTN']);
  assert.deepEqual([intent.departFrom, intent.departTo], ['2026-12-01', '2026-12-31']);
});

test('mountains and ski, with the next January', () => {
  assert.deepEqual(parse('munte').destinations, ['GHV']);
  const ski = parse('ski in january');
  assert.deepEqual(ski.destinations, ['GHV']);
  assert.deepEqual([ski.departFrom, ski.departTo], ['2027-01-01', '2027-01-31']);
});

test('tomorrow, cheapest, a named city', () => {
  const intent = parse('cheapest flights to budapest tomorrow');
  assert.deepEqual(intent.destinations, ['BUD']);
  assert.deepEqual([intent.departFrom, intent.departTo], ['2026-10-01', '2026-10-01']);
  assert.equal(intent.sort, 'cheapest');
});

test('"mai" only means May when it looks like a date', () => {
  const cheaper = parse('ceva mai ieftin in italia');
  assert.equal(cheaper.departFrom, '');
  assert.equal(cheaper.sort, 'cheapest');
  const may = parse('15 mai');
  assert.deepEqual([may.departFrom, may.departTo], ['2027-05-15', '2027-05-15']);
});

test('holidays and trip lengths', () => {
  const xmas = parse('craciun la budapesta');
  assert.deepEqual(xmas.destinations, ['BUD']);
  assert.deepEqual([xmas.departFrom, xmas.departTo], ['2026-12-19', '2026-12-26']);
  const week = parse('o saptamana la mare');
  assert.deepEqual([week.minNights, week.maxNights], [6, 8]);
  const days = parse('5 days in Alicante');
  assert.deepEqual([days.minNights, days.maxNights], [4, 4]);
  assert.deepEqual(days.destinations, ['ALC']);
});

test('this weekend and next weekend', () => {
  const thisWeekend = parse('this weekend');
  assert.deepEqual([thisWeekend.departFrom, thisWeekend.departTo], ['2026-10-01', '2026-10-03']);
  assert.equal(thisWeekend.weekendOnly, true);
  const nextWeekend = parse('weekendul viitor');
  assert.deepEqual([nextWeekend.departFrom, nextWeekend.departTo], ['2026-10-08', '2026-10-10']);
});

test('nothing understood gives an empty intent with a helpful reply', () => {
  const intent = parse('asdf qwerty');
  assert.deepEqual(intent.destinations, []);
  assert.equal(intent.departFrom, '');
  assert.equal(intent.understood, false);
  assert.match(intent.reply, /try/i);
});
