import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSources } from '../src/merge.js';

const place = (iata, name) => ({ iata, name, country: 'X', countryCode: 'XX', lat: 1, lon: 2 });
const BUD = place('BUD', 'Budapest');
const SAW = place('SAW', 'Istanbul');
const trip = (airlineCode, totalEur, extra = {}) => ({ outDate: '2026-10-10', backDate: '2026-10-14', airlineCode, totalEur, ...extra });
const placeFor = (iata) => ({ SAW, OTP: place('OTP', 'Bucharest') })[iata] ?? null;
const airlineName = (code) => ({ '5F': 'Fly One', VF: 'Ajet', W6: 'Wizz Air' })[code] ?? null;

test('mergeSources adds other airlines to Wizz destinations and creates new destinations', () => {
  const wizzTrip = trip('W6', 32, { airline: 'Wizz Air', source: 'wizz' });
  const merged = mergeSources({
    originIata: 'RMO',
    wizz: [{ dest: BUD, trips: [wizzTrip] }],
    others: [
      { destIata: 'BUD', trip: trip('W6', 30) }, // cached Wizz fare: live data wins
      { destIata: 'BUD', trip: trip('5F', 40) },
      { destIata: 'SAW', trip: trip('VF', 58) },
      { destIata: 'SAW', trip: trip('XX', 70) }, // unknown airline code stays visible
      { destIata: 'RMO', trip: trip('5F', 10) }, // the origin itself
      { destIata: 'ZZZ', trip: trip('5F', 10) }, // unknown place
    ],
    placeFor,
    airlineName,
  });

  assert.deepEqual(merged.map(({ dest }) => dest.iata), ['BUD', 'SAW']);
  assert.deepEqual(merged[0].trips, [wizzTrip, { ...trip('5F', 40), airline: 'Fly One' }]);
  assert.deepEqual(merged[1].trips.map((t) => t.airline), ['Ajet', 'XX']);
});

test('mergeSources keeps cached Wizz fares for routes the live Wizz scan could not reach', () => {
  const merged = mergeSources({
    originIata: 'RMO',
    wizz: [],
    others: [{ destIata: 'OTP', trip: trip('W6', 44) }],
    placeFor,
    airlineName,
  });
  assert.equal(merged[0].dest.iata, 'OTP');
  assert.equal(merged[0].trips[0].airline, 'Wizz Air');
});

test('mergeSources treats Wizz Air Malta (W4) and UK (W9) as Wizz Air: live data wins, and they are named Wizz Air', () => {
  const merged = mergeSources({
    originIata: 'RMO',
    wizz: [{ dest: BUD, trips: [trip('W6', 32, { airline: 'Wizz Air', source: 'wizz' })] }],
    others: [{ destIata: 'BUD', trip: trip('W4', 28) }, { destIata: 'OTP', trip: trip('W9', 44, { stops: 1 }) }],
    placeFor,
    airlineName: (code) => ({ W4: 'Wizz Air Malta', W9: 'Wizz Air UK' })[code] ?? null,
  });
  assert.equal(merged[0].trips.length, 1, 'the cached W4 fare to Budapest duplicates the live scan');
  assert.deepEqual([merged[1].dest.iata, merged[1].trips[0].airline], ['OTP', 'Wizz Air']);
});
