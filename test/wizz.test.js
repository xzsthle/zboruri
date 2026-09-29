import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingUrl, createWizzClient, parseApiVersion, parseFares, parseRouteMap, timetableBody } from '../src/wizz.js';

const city = (iata, shortName, extra = {}) => ({
  iata, shortName, countryName: 'Country', countryCode: 'XX', isFakeStation: false, connections: [], ...extra,
});

const routeMap = {
  cities: [
    city('RMO', 'Chisinau', {
      countryName: 'Moldova',
      countryCode: 'MD',
      connections: [
        { iata: 'VCE', isDirectFlight: true },
        { iata: 'BUD', isDirectFlight: true },
        { iata: 'LON', isDirectFlight: true },
        { iata: 'OTP', isDirectFlight: false },
        { iata: 'ZZZ', isDirectFlight: true },
      ],
    }),
    city('BUD', 'Budapest\r\n', { countryName: 'Hungary', countryCode: 'HU' }),
    city('VCE', 'Venice', { countryName: 'Italy', countryCode: 'IT' }),
    city('LON', 'London (All Airports)', { isFakeStation: true }),
    city('OTP', 'Bucharest'),
  ],
};

const flight = (date, amount, extra = {}) => ({
  departureStation: 'RMO',
  arrivalStation: 'BUD',
  departureDate: `${date}T00:00:00`,
  departureDates: [`${date}T16:30:00`],
  price: { amount, currencyCode: 'MDL' },
  priceType: 'price',
  ...extra,
});

const rawFlights = [
  flight('2026-10-06', 0, { priceType: 'checkPrice' }),
  flight('2026-10-08', 679, { departureDates: ['2026-10-08T16:30:00', '2026-10-08T21:05:00'] }),
];

test('parseApiVersion extracts the backend version from the homepage', () => {
  assert.equal(parseApiVersion('<link href="https://be.wizzair.com/29.18.0/Api/x">'), '29.18.0');
});

test('parseApiVersion explains when the version cannot be found', () => {
  assert.throws(() => parseApiVersion('<html></html>'), /Could not find the Wizz Air API version/);
});

test('parseRouteMap keeps real airports with direct flights, trimmed and sorted by name', () => {
  assert.deepEqual(parseRouteMap(routeMap, 'RMO'), {
    origin: { iata: 'RMO', name: 'Chisinau', country: 'Moldova', countryCode: 'MD' },
    destinations: [
      { iata: 'BUD', name: 'Budapest', country: 'Hungary', countryCode: 'HU' },
      { iata: 'VCE', name: 'Venice', country: 'Italy', countryCode: 'IT' },
    ],
  });
});

test('parseRouteMap rejects an unknown origin or unexpected shape', () => {
  assert.throws(() => parseRouteMap(routeMap, 'XXX'), /does not list XXX/);
  assert.throws(() => parseRouteMap({}, 'RMO'), /unexpected shape/);
});

test('parseFares keeps only priced fares with their departure times', () => {
  assert.deepEqual(parseFares(rawFlights, 'RMO', 'BUD'), [
    { date: '2026-10-08', times: ['16:30', '21:05'], amount: 679, currency: 'MDL' },
  ]);
  assert.deepEqual(parseFares(undefined, 'RMO', 'BUD'), []);
});

test('parseFares keeps only well-formed HH:MM departure times', () => {
  const [fare] = parseFares([flight('2026-10-09', 500, { departureDates: ['garbage<b>', '2026-10-09T07:05:00'] })], 'RMO', 'BUD');
  assert.deepEqual(fare.times, ['07:05']);
});

test('parseFares drops sibling airports that Wizz Air mixes in for the same city', () => {
  const london = [
    flight('2026-10-08', 900, { arrivalStation: 'LGW' }),
    flight('2026-10-09', 500, { arrivalStation: 'LTN', hasMacFlight: true }),
  ];
  assert.deepEqual(parseFares(london, 'RMO', 'LGW').map((f) => f.date), ['2026-10-08']);
});

test('timetableBody asks for both directions over the same window', () => {
  assert.deepEqual(timetableBody('RMO', 'BUD', { from: '2026-10-01', to: '2026-11-11' }), {
    flightList: [
      { departureStation: 'RMO', arrivalStation: 'BUD', from: '2026-10-01', to: '2026-11-11' },
      { departureStation: 'BUD', arrivalStation: 'RMO', from: '2026-10-01', to: '2026-11-11' },
    ],
    priceType: 'regular',
    adultCount: 1,
    childCount: 0,
    infantCount: 0,
  });
});

test('bookingUrl deep-links to the Wizz Air flight selection page', () => {
  assert.equal(
    bookingUrl('RMO', 'BUD', '2026-10-08', '2026-10-12'),
    'https://www.wizzair.com/en-gb/booking/select-flight/RMO/BUD/2026-10-08/2026-10-12/1/0/0/null',
  );
});

test('the client calls the version, route map and timetable endpoints', async () => {
  const calls = [];
  const http = {
    getText: async (url) => { calls.push(url); return 'be.wizzair.com/1.2.3/'; },
    getJson: async (url) => { calls.push(url); return routeMap; },
    postJson: async (url, body) => {
      calls.push(url);
      assert.equal(body.flightList[0].arrivalStation, 'BUD');
      return {
        outboundFlights: rawFlights,
        returnFlights: [
          flight('2026-10-10', 500, { departureStation: 'BUD', arrivalStation: 'RMO' }),
          flight('2026-10-11', 500, { departureStation: 'RMO', arrivalStation: 'BUD' }),
        ],
      };
    },
  };
  const wizz = createWizzClient(http);
  const version = await wizz.getApiVersion();
  const { destinations } = await wizz.getRouteMap(version, 'RMO');
  const fares = await wizz.getTimetable(version, 'RMO', 'BUD', { from: '2026-10-01', to: '2026-10-10' });

  assert.equal(version, '1.2.3');
  assert.equal(destinations.length, 2);
  assert.deepEqual(fares.outbound.map((f) => f.date), ['2026-10-08']);
  assert.deepEqual(fares.inbound.map((f) => f.date), ['2026-10-10'], 'return fares must fly BUD → RMO');
  assert.deepEqual(calls, [
    'https://www.wizzair.com/en-gb',
    'https://be.wizzair.com/1.2.3/Api/asset/map?languageCode=en-gb',
    'https://be.wizzair.com/1.2.3/Api/search/timetable',
  ]);
});
