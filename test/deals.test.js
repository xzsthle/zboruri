import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheapestPerDate, fareLegs, flattenDeals, roundTrips, summarizeTrips, toEurFares, wizzTrips } from '../src/deals.js';

const rates = { EUR: 1, MDL: 20 };
const fare = (date, amount) => ({ date, times: ['10:00'], amount, currency: 'MDL' });
const eurFare = (date, priceEur) => ({ date, times: ['10:00'], priceEur });
const dest = { iata: 'BGY', name: 'Milan Bergamo', country: 'Italy', countryCode: 'IT', lat: 45.7, lon: 9.7 };
const config = { minNights: 2, maxNights: 5, maxReturnPriceEur: 60, maxDealsPerDestination: 2 };
const linkFor = (iata, outDate, backDate) => `https://book/${iata}/${outDate}/${backDate}`;
const trip = (outDate, backDate, totalEur, airline = 'Wizz Air', airlineCode = 'W6') =>
  ({ outDate, backDate, totalEur, airline, airlineCode, nights: 3 });

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
  const [pair] = roundTrips([eurFare('2026-10-01', 10.1)], [eurFare('2026-10-03', 20.2)], { minNights: 1, maxNights: 5 });
  assert.equal(pair.totalEur, 30.3);
});

test('wizzTrips prices both directions in euros and tags every trip as live Wizz Air', () => {
  const scan = { dest, outbound: [fare('2026-10-01', 200), fare('2026-10-01', 300)], inbound: [fare('2026-10-04', 400)] };
  const [only, ...rest] = wizzTrips(scan, { rates, config, linkFor });
  assert.equal(rest.length, 0);
  assert.equal(only.totalEur, 30);
  assert.equal(only.bookingUrl, 'https://book/BGY/2026-10-01/2026-10-04');
  assert.equal(only.airline, 'Wizz Air');
  assert.equal(only.airlineCode, 'W6');
  assert.equal(only.source, 'wizz');
  assert.equal(only.stops, 0);
});

test('summarizeTrips returns the cheapest trip, capped deals, a fare calendar and airlines', () => {
  const trips = [
    trip('2026-10-01', '2026-10-04', 30),
    trip('2026-10-05', '2026-10-07', 20),
    trip('2026-10-05', '2026-10-09', 26, 'Fly One', '5F'),
    trip('2026-10-08', '2026-10-11', 100),
  ];
  const summary = summarizeTrips(dest, trips, config);
  assert.equal(summary.iata, 'BGY');
  assert.equal(summary.lat, 45.7);
  assert.equal(summary.cheapest.totalEur, 20);
  assert.equal(summary.dealCount, 3);
  assert.deepEqual(summary.deals.map((d) => d.totalEur), [20, 26]);
  assert.deepEqual(summary.calendar, [['2026-10-01', 30], ['2026-10-05', 20], ['2026-10-08', 100]]);
  assert.deepEqual(summary.airlines, ['Fly One', 'Wizz Air']);
});

test('summarizeTrips drops duplicate date pairs on the same airline, keeping the cheaper one', () => {
  const summary = summarizeTrips(dest, [trip('2026-10-05', '2026-10-07', 25), trip('2026-10-05', '2026-10-07', 21)], config);
  assert.deepEqual(summary.deals.map((d) => d.totalEur), [21]);
  assert.equal(summary.dealCount, 1);
});

test('summarizeTrips handles a destination without any trips', () => {
  const summary = summarizeTrips(dest, [], config);
  assert.equal(summary.cheapest, null);
  assert.deepEqual(summary.deals, []);
  assert.deepEqual(summary.calendar, []);
  assert.deepEqual(summary.airlines, []);
});

test('flattenDeals pairs every deal with its destination', () => {
  const deal = trip('2026-10-05', '2026-10-07', 20);
  const summaries = [{ ...dest, cheapest: deal, dealCount: 1, deals: [deal] }, { iata: 'BUD', name: 'Budapest', deals: [] }];
  const [first, ...rest] = flattenDeals(summaries);
  assert.equal(rest.length, 0);
  assert.deepEqual(first.destination, { iata: 'BGY', name: 'Milan Bergamo', country: 'Italy', countryCode: 'IT' });
  assert.equal(first.trip, deal);
});

test('fareLegs keeps the cheapest one-way fare per day in euros, for the search page', () => {
  const legs = fareLegs({ outbound: [fare('2026-10-01', 400), fare('2026-10-01', 200)], inbound: [fare('2026-10-04', 600)] }, rates);
  assert.deepEqual(legs, { out: [['2026-10-01', ['10:00'], 10]], back: [['2026-10-04', ['10:00'], 30]] });
});
