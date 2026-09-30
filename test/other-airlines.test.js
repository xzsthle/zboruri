import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capPerDestination, scanOtherAirlines } from '../src/other-airlines.js';

const found = (destIata, totalEur) => ({ destIata, trip: { totalEur, outDate: '2026-10-10', backDate: '2026-10-14' } });
const log = { info: () => {}, warn: () => {} };

test('capPerDestination keeps only the cheapest trips for each destination', () => {
  const capped = capPerDestination([found('IST', 90), found('IST', 40), found('LHR', 300), found('IST', 60)], 2);
  assert.deepEqual(capped.map(({ destIata, trip }) => [destIata, trip.totalEur]), [['IST', 40], ['IST', 60], ['LHR', 300]]);
});

test('scanOtherAirlines asks for connecting flights unless the config says direct only', async () => {
  const calls = [];
  const travelpayouts = { fetchTrips: async (args) => { calls.push(args.directOnly); return [found('IST', 50)]; } };
  const base = { travelpayouts, origin: 'RMO', fromIso: '2026-10-01', toIso: '2026-12-31', log };
  const result = await scanOtherAirlines({ ...base, config: { minNights: 2, maxNights: 10, directFlightsOnly: false } });
  await scanOtherAirlines({ ...base, config: { minNights: 2, maxNights: 10, directFlightsOnly: true } });
  assert.deepEqual(calls, [false, true]);
  assert.deepEqual(result.status, { status: 'ok', trips: 1 });
});
