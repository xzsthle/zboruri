import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReference, createReferenceClient, createTravelpayoutsClient, departureMonths, parsePrices, TravelpayoutsAuthError,
} from '../src/travelpayouts.js';
import { HttpError } from '../src/http.js';

const row = (extra = {}) => ({
  origin: 'RMO',
  destination: 'IST',
  origin_airport: 'RMO',
  destination_airport: 'SAW',
  price: 58,
  airline: 'VF',
  flight_number: '123',
  departure_at: '2026-10-10T06:30:00+03:00',
  return_at: '2026-10-14T21:05:00+03:00',
  transfers: 0,
  return_transfers: 0,
  link: '/search/RMO1010IST14101?t=abc',
  ...extra,
});
const options = { fromIso: '2026-10-01', toIso: '2026-12-31', minNights: 2, maxNights: 10, marker: '' };

test('departureMonths lists every month the search window touches', () => {
  assert.deepEqual(departureMonths('2026-09-30', '2027-01-27'), ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
  assert.deepEqual(departureMonths('2026-10-02', '2026-10-20'), ['2026-10']);
});

test('parsePrices turns rows into round trips keyed by destination airport', () => {
  assert.deepEqual(parsePrices({ success: true, data: [row()] }, options), [{
    destIata: 'SAW',
    trip: {
      outDate: '2026-10-10', outTimes: ['06:30'],
      backDate: '2026-10-14', backTimes: ['21:05'],
      nights: 4, totalEur: 58, airlineCode: 'VF', stops: 0,
      bookingUrl: 'https://www.aviasales.com/search/RMO1010IST14101?t=abc',
      source: 'travelpayouts',
    },
  }]);
});

test('parsePrices skips rows outside the window, stay length or with bad data', () => {
  const rows = [
    row({ price: 0 }),
    row({ return_at: '2026-10-11T08:00:00+03:00' }), // 1 night
    row({ departure_at: '2026-09-20T08:00:00+03:00' }), // before the window
    row({ return_at: undefined }), // one-way
    row({ destination_airport: undefined, destination: 'x' }), // no usable code
    row({ destination_airport: 'BUD', price: 45.5, airline: 'W6', transfers: 1 }),
  ];
  const trips = parsePrices({ success: true, data: rows }, options);
  assert.deepEqual(trips.map((t) => [t.destIata, t.trip.totalEur, t.trip.stops]), [['BUD', 45.5, 1]]);
});

test('parsePrices adds the affiliate marker and refuses links that are not site paths', () => {
  const [marked] = parsePrices({ success: true, data: [row()] }, { ...options, marker: '12345' });
  assert.equal(marked.trip.bookingUrl, 'https://www.aviasales.com/search/RMO1010IST14101?t=abc&marker=12345');
  const [unsafe] = parsePrices({ success: true, data: [row({ link: 'javascript:alert(1)' })] }, options);
  assert.equal(unsafe.trip.bookingUrl, null);
});

test('parsePrices reports API-level errors and unexpected shapes', () => {
  assert.throws(() => parsePrices({ success: false, error: 'bad origin' }, options), /Travelpayouts: bad origin/);
  assert.throws(() => parsePrices({}, options), /unexpected response/);
});

test('buildReference resolves airports (or cities) to places and airline codes to names', () => {
  const reference = buildReference({
    airports: [{ code: 'SAW', name: 'Sabiha Gokcen', time_zone: 'Europe/Istanbul', city_code: 'IST', country_code: 'TR', coordinates: { lat: 40.9, lon: 29.3 } }],
    cities: [{ code: 'IST', name: 'Istanbul', country_code: 'TR', coordinates: { lat: 41, lon: 28.9 } }],
    countries: [{ code: 'TR', name: 'Turkey' }],
    airlines: [{ code: 'VF', name: 'Ajet' }],
  });
  assert.deepEqual(reference.placeFor('SAW'), { iata: 'SAW', name: 'Istanbul', country: 'Turkey', countryCode: 'TR', lat: 40.9, lon: 29.3 });
  assert.deepEqual(reference.placeFor('IST'), { iata: 'IST', name: 'Istanbul', country: 'Turkey', countryCode: 'TR', lat: 41, lon: 28.9 });
  assert.equal(reference.placeFor('ZZZ'), null);
  assert.equal(reference.airlineName('VF'), 'Ajet');
  assert.equal(reference.airlineName('ZZ'), null);
  assert.deepEqual(reference.airportInfo('SAW'), { airportName: 'Sabiha Gokcen', timeZone: 'Europe/Istanbul' });
  assert.deepEqual(reference.airportInfo('ZZZ'), {});
});

test('the client sends the token as a header, never in the URL', async () => {
  let request;
  const http = { getJson: async (url, init) => { request = { url, init }; return { success: true, data: [] }; } };
  const client = createTravelpayoutsClient(http, { token: 'secret-token' });
  await client.fetchPrices({ origin: 'RMO', month: '2026-10', directOnly: true });
  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  assert.equal(url.searchParams.get('origin'), 'RMO');
  assert.equal(url.searchParams.get('departure_at'), '2026-10');
  assert.equal(url.searchParams.get('one_way'), 'false');
  assert.equal(url.searchParams.get('direct'), 'true');
  assert.equal(url.searchParams.get('currency'), 'eur');
  assert.equal(url.searchParams.get('limit'), '1000');
  assert.doesNotMatch(request.url, /secret-token/);
  assert.equal(request.init.headers['X-Access-Token'], 'secret-token');
});

test('fetchTrips queries each departure month in the window and parses the rows', async () => {
  const months = [];
  const http = {
    getJson: async (url) => {
      const month = new URL(url).searchParams.get('departure_at');
      months.push(month);
      return { success: true, data: month === '2026-10' ? [row()] : [] };
    },
  };
  const client = createTravelpayoutsClient(http, { token: 't', marker: '42' });
  const trips = await client.fetchTrips({
    origin: 'RMO', fromIso: '2026-09-30', toIso: '2026-11-15', minNights: 2, maxNights: 10, directOnly: true,
  });
  assert.deepEqual(months, ['2026-09', '2026-10', '2026-11']);
  assert.equal(trips.length, 1);
  assert.match(trips[0].trip.bookingUrl, /marker=42$/);
});

test('the client turns a rejected token into a clear auth error', async () => {
  const http = { getJson: async (url) => { throw new HttpError(401, url, 'Unauthorized'); } };
  const client = createTravelpayoutsClient(http, { token: 'secret-token' });
  await assert.rejects(client.fetchPrices({ origin: 'RMO', month: '2026-10', directOnly: true }), (err) => {
    assert.ok(err instanceof TravelpayoutsAuthError);
    assert.match(err.message, /rejected the API token.*TRAVELPAYOUTS_TOKEN/);
    return true;
  });
});

test('the reference client loads the four public files without a token', async () => {
  const urls = [];
  const http = { getJson: async (url) => { urls.push(url); return []; } };
  const reference = await createReferenceClient(http).fetchReference();
  assert.deepEqual(urls.toSorted(), [
    'https://api.travelpayouts.com/data/en/airlines.json',
    'https://api.travelpayouts.com/data/en/airports.json',
    'https://api.travelpayouts.com/data/en/cities.json',
    'https://api.travelpayouts.com/data/en/countries.json',
  ]);
  assert.equal(reference.placeFor('SAW'), null);
});
