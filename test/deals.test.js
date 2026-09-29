import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheapestPerDate, flattenDeals, roundTrips, summarizeDestination, toEurFares } from '../src/deals.js';

const rates = { EUR: 1, MDL: 20 };
const fare = (date, amount) => ({ date, times: ['10:00'], amount, currency: 'MDL' });
const eurFare = (date, priceEur) => ({ date, times: ['10:00'], priceEur });
const dest = { iata: 'BGY', name: 'Milan Bergamo', country: 'Italy', countryCode: 'IT' };
const config = { minNights: 2, maxNights: 5, maxReturnPriceEur: 60, maxDealsPerDestination: 2 };
const linkFor = (iata, outDate, backDate) => `https://book/${iata}/${outDate}/${backDate}`;

test('toEurFares converts each fare and keeps date and times', () => {
  assert.deepEqual(toEurFares([fare('2026-10-01', 400)], rates), [eurFare('2026-10-01', 20)]);
});

test('cheapestPerDate keeps the lowest fare per date, sorted by date', () => {
  const fares = [eurFare('2026-10-03', 30), eurFare('2026-10-01', 25), eurFare('2026-10-03', 12)];
  assert.deepEqual(cheapestPerDate(fares), [eurFare('2026-10-01', 25), eurFare('2026-10-03', 12)]);
});

test('roundTrips pairs outbound and return flights within the night range', () => {
  const outbound = [eurFare('2026-10-01', 10), eurFare('2026-10-02', 20)];
  const inbound = [eurFare('2026-10-02', 5), eurFare('2026-10-04', 15), eurFare('2026-10-10', 5)];
  const trips = roundTrips(outbound, inbound, { minNights: 2, maxNights: 5 });
  assert.deepEqual(
    trips.map((t) => [t.outDate, t.backDate, t.nights, t.totalEur]),
    [
      ['2026-10-01', '2026-10-04', 3, 25],
      ['2026-10-02', '2026-10-04', 2, 35],
    ],
  );
  assert.deepEqual(trips[0], {
    outDate: '2026-10-01', outTimes: ['10:00'], outEur: 10,
    backDate: '2026-10-04', backTimes: ['10:00'], backEur: 15,
    nights: 3, totalEur: 25,
  });
});

test('roundTrips rounds totals to cents', () => {
  const [trip] = roundTrips([eurFare('2026-10-01', 10.1)], [eurFare('2026-10-03', 20.2)], { minNights: 1, maxNights: 5 });
  assert.equal(trip.totalEur, 30.3);
});

test('summarizeDestination returns the cheapest trip and capped, sorted deals under the limit', () => {
  const scan = {
    dest,
    outbound: [fare('2026-10-01', 200), fare('2026-10-05', 200), fare('2026-10-08', 600)],
    inbound: [fare('2026-10-04', 400), fare('2026-10-07', 200), fare('2026-10-11', 400)],
  };
  const summary = summarizeDestination(scan, { rates, config, linkFor });
  assert.equal(summary.iata, 'BGY');
  assert.equal(summary.cheapest.totalEur, 20);
  assert.equal(summary.cheapest.bookingUrl, 'https://book/BGY/2026-10-05/2026-10-07');
  assert.equal(summary.dealCount, 3);
  assert.deepEqual(summary.deals.map((d) => [d.outDate, d.backDate, d.totalEur]), [
    ['2026-10-05', '2026-10-07', 20],
    ['2026-10-01', '2026-10-04', 30],
  ]);
});

test('summarizeDestination returns no cheapest trip when nothing pairs up', () => {
  const summary = summarizeDestination({ dest, outbound: [fare('2026-10-01', 100)], inbound: [] }, { rates, config, linkFor });
  assert.equal(summary.cheapest, null);
  assert.deepEqual(summary.deals, []);
  assert.equal(summary.dealCount, 0);
});

test('flattenDeals pairs every deal with its destination', () => {
  const trip = { outDate: '2026-10-05', backDate: '2026-10-07', totalEur: 20 };
  const summaries = [{ ...dest, cheapest: trip, dealCount: 1, deals: [trip] }, { iata: 'BUD', name: 'Budapest', deals: [] }];
  const [deal, ...rest] = flattenDeals(summaries);
  assert.equal(rest.length, 0);
  assert.deepEqual(deal.destination, dest);
  assert.equal(deal.trip, trip);
});
