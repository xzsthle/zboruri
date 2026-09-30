import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, windowOf } from '../docs/js/engine.js';
import { distanceKm, estimateArrival, estimateMinutes, fmtDuration, hoursBetween, nowIn } from '../docs/js/geo.js';
import { DEFAULT_FILTERS, DEFAULT_QUERY, departSpec, parseHash, toHash } from '../docs/js/query.js';
import { flightInfo } from '../docs/js/flight.js';

const site = {
  origin: { iata: 'RMO', lat: 46.93, lon: 28.93, timeZone: 'Europe/Chisinau' },
  rules: { minNights: 2, maxNights: 10 },
  destinations: [
    { iata: 'SOF', name: 'Sofia', country: 'Bulgaria' },
    { iata: 'BUD', name: 'Budapest', country: 'Hungary' },
  ],
};
const fares = {
  destinations: {
    SOF: {
      out: [['2026-10-24', ['16:20'], 15], ['2026-10-30', ['05:10'], 10]],
      back: [['2026-10-26', ['11:55'], 17], ['2026-11-02', ['23:00'], 12], ['2026-10-31', ['09:00'], 40]],
      cached: [],
    },
    BUD: {
      out: [['2026-11-03', ['14:25'], 20]],
      back: [['2026-11-05', ['05:55'], 17]],
      cached: [{
        outDate: '2026-11-04', outTimes: ['07:00'], backDate: '2026-11-07', backTimes: ['19:00'], nights: 3, totalEur: 30,
        airline: 'Fly One', airlineCode: '5F', source: 'travelpayouts', bookingUrl: 'https://www.aviasales.com/search/x',
      }],
    },
  },
};
const engine = createEngine(site, fares);
const query = (patch = {}) => ({ ...DEFAULT_QUERY, ...patch });
const filters = (patch = {}) => ({ ...DEFAULT_FILTERS, ...patch });
const summary = (trips) => trips.map((t) => [t.outDate, t.backDate, t.nights, t.pricePp]);

test('search pairs live one-way fares within the stay range, cheapest first', () => {
  const trips = engine.search(query({ to: 'SOF' }), filters({ sort: 'cheapest' }));
  assert.deepEqual(summary(trips), [
    ['2026-10-30', '2026-11-02', 3, 22],
    ['2026-10-24', '2026-11-02', 9, 27],
    ['2026-10-24', '2026-10-26', 2, 32],
    ['2026-10-24', '2026-10-31', 7, 55],
  ]);
  assert.equal(trips[0].airline, 'Wizz Air');
  assert.equal(trips[0].source, 'wizz');
});

test('best order penalises night departures and late returns', () => {
  const [best] = engine.search(query({ to: 'SOF' }), filters({ sort: 'best' }));
  assert.deepEqual([best.outDate, best.backDate], ['2026-10-24', '2026-11-02'], 'the €22 trip leaves at 05:10, so it ranks lower');
});

test('depart month, exact day and a fixed return day narrow the results', () => {
  assert.equal(engine.search(query({ to: 'SOF', depart: '2026-11' }), filters()).length, 0);
  assert.deepEqual(summary(engine.search(query({ to: 'SOF', depart: '2026-10-30' }), filters())), [['2026-10-30', '2026-11-02', 3, 22]]);
  assert.deepEqual(summary(engine.search(query({ to: 'SOF', depart: '2026-10-24', back: '2026-10-26' }), filters())), [['2026-10-24', '2026-10-26', 2, 32]]);
});

test('filters by departure window, airline, max price and cached fares', () => {
  assert.deepEqual(engine.search(query({ to: 'SOF' }), filters({ outWin: ['night'] })).map((t) => t.outTime), ['05:10']);
  assert.deepEqual(engine.search(query({ to: 'BUD' }), filters({ airlines: ['Fly One'] })).map((t) => t.source), ['travelpayouts']);
  assert.equal(engine.search(query({ to: 'BUD' }), filters({ maxPrice: 31 })).length, 1);
  assert.equal(engine.search(query({ to: 'BUD', others: false }), filters()).length, 1);
  assert.deepEqual(
    summary(engine.search(query({ to: 'SOF' }), filters({ weekend: true, sort: 'soonest' }))).map(([out, back]) => [out, back]),
    [['2026-10-24', '2026-10-26'], ['2026-10-30', '2026-11-02']],
    'Sat → Mon and Fri → Mon are weekends; the 7- and 9-night trips are not',
  );
});

// Istanbul with one direct and two connecting cached trips (4 nights each).
const via = (stops, backStops, totalEur, outDate) => ({
  outDate, outTimes: ['09:00'], backDate: `2026-11-${String(Number(outDate.slice(8)) + 4).padStart(2, '0')}`, backTimes: ['18:00'], nights: 4,
  totalEur, airline: 'Turkish Airlines', airlineCode: 'TK', source: 'travelpayouts', bookingUrl: null,
  stops: Math.max(stops, backStops), outStops: stops, backStops, outMinutes: stops ? 330 : 95, backMinutes: backStops ? 410 : 100,
});
const connecting = createEngine(
  { ...site, destinations: [...site.destinations, { iata: 'IST', name: 'Istanbul', country: 'Turkey', lat: 41.26, lon: 28.74, timeZone: 'Europe/Istanbul' }] },
  { destinations: { IST: { out: [], back: [], cached: [via(0, 0, 120, '2026-11-02'), via(1, 0, 90, '2026-11-03'), via(1, 2, 70, '2026-11-04')] } } },
);

test('the stops filter keeps direct, one-stop or two-plus-stop trips (the most stops in either direction)', () => {
  const prices = (stops) => connecting.search(query({ to: 'IST' }), filters({ stops, sort: 'cheapest' })).map((t) => t.pricePp);
  assert.deepEqual(prices([]), [70, 90, 120]);
  assert.deepEqual(prices(['0']), [120]);
  assert.deepEqual(prices(['1']), [90]);
  assert.deepEqual(prices(['1', '2']), [70, 90]);
});

test('cached trips keep the stops and flight time per direction; flightInfo prefers them to the estimate', () => {
  const [trip] = connecting.search(query({ to: 'IST' }), filters({ stops: ['1'] }));
  assert.deepEqual([trip.outStops, trip.backStops, trip.outMinutes, trip.backMinutes], [1, 0, 330, 100]);
  const info = flightInfo(trip, { ...site, origin: { ...site.origin } }, connecting);
  assert.deepEqual([info.out.stops, info.out.minutes, info.out.estimated], [1, 330, false]);
  assert.equal(info.out.arr.time, '15:30', '09:00 + 5h30, and Istanbul is an hour ahead of Chișinău in November');
  const [live] = engine.search(query({ to: 'SOF' }), filters());
  assert.deepEqual([flightInfo(live, site, engine).out.stops, flightInfo(live, site, engine).out.estimated], [0, true]);
});

test('explore returns the cheapest trip per destination, cheapest destination first', () => {
  const rows = engine.explore(query(), filters());
  assert.deepEqual(rows.map((r) => [r.dest.iata, r.best.pricePp, r.count]), [['SOF', 22, 4], ['BUD', 30, 2]]);
});

test('price maps for the date pickers', () => {
  const byDay = engine.pricesByDepartDay(query({ to: 'SOF' }));
  assert.equal(byDay.get('2026-10-24'), 27);
  assert.equal(byDay.get('2026-10-30'), 22);
  assert.equal(engine.pricesByReturnDay(query({ to: 'SOF' }), '2026-10-24').get('2026-10-26'), 32);
  assert.deepEqual([...engine.pricesByMonth(query())], [['2026-10', 22], ['2026-11', 30]]);
  assert.deepEqual(engine.dateRange(), { first: '2026-10-24', last: '2026-11-03' });
  assert.deepEqual(engine.airlines(), ['Fly One', 'Wizz Air']);
});

test('windowOf buckets departure times', () => {
  assert.equal(windowOf('05:59'), 'night');
  assert.equal(windowOf('06:00'), 'morning');
  assert.equal(windowOf('18:30'), 'evening');
  assert.equal(windowOf(null), null);
});

test('distance, flight time estimate and local arrival across time zones', () => {
  const km = distanceKm({ lat: 46.93, lon: 28.93 }, { lat: 42.69, lon: 23.41 });
  assert.ok(km > 600 && km < 700, `RMO–SOF is about 640 km, got ${km}`);
  assert.equal(distanceKm({ lat: 1 }, { lat: 2, lon: 3 }), null);
  assert.equal(estimateMinutes(750), 90);
  assert.equal(fmtDuration(95), '1h 35m');
  assert.equal(fmtDuration(55), '55m');
  // Chișinău and Sofia share a time zone: 16:20 + 80 min = 17:40.
  assert.deepEqual(
    estimateArrival({ date: '2026-10-24', time: '16:20', fromZone: 'Europe/Chisinau', toZone: 'Europe/Sofia', minutes: 80 }),
    { time: '17:40', nextDay: false },
  );
  // 23:30 in Chișinău (UTC+3) + 3 h lands at 00:30 in London (UTC+1), the next day.
  assert.deepEqual(
    estimateArrival({ date: '2026-10-10', time: '23:30', fromZone: 'Europe/Chisinau', toZone: 'Europe/London', minutes: 180 }),
    { time: '00:30', nextDay: true },
  );
  assert.equal(estimateArrival({ date: '2026-10-10', time: null, fromZone: 'Europe/Chisinau', toZone: 'Europe/London', minutes: 60 }), null);
  assert.equal(estimateArrival({ date: '2026-10-10', time: '10:00', fromZone: 'Nowhere/Zone', toZone: 'Europe/London', minutes: 60 }), null);
});

test('local time now and the time difference between airports', () => {
  assert.match(nowIn('Europe/Sofia'), /^\d{2}:\d{2}$/);
  assert.equal(nowIn('Nowhere/Zone'), null);
  // London is two hours behind Chișinău all year (both switch to summer time on the same day).
  assert.equal(hoursBetween('Europe/Chisinau', 'Europe/London'), -2);
  assert.equal(hoursBetween('Europe/Chisinau', 'Nowhere/Zone'), null);
});

test('query and filters round-trip through the URL hash', () => {
  const q = { ...DEFAULT_QUERY, to: 'SOF', depart: '2026-10', min: 3, max: 5, adults: 2 };
  const f = { ...DEFAULT_FILTERS, sort: 'cheapest', airlines: ['Wizz Air'], outWin: ['morning'], maxPrice: 50, weekend: true, stops: ['0', '1'] };
  const parsed = parseHash(toHash(q, f), site.rules);
  assert.equal(parsed.view, 'search');
  assert.deepEqual(parsed.query, q);
  assert.deepEqual(parsed.filters, f);
});

test('parseHash clamps or drops anything unexpected', () => {
  const junk = parseHash('#/search?to=<script>&depart=soon&min=-5&max=99&adults=40&sort=evil&dep=noon', site.rules);
  assert.deepEqual(junk.query, { ...DEFAULT_QUERY, adults: 9 });
  assert.equal(junk.filters.sort, 'best');
  assert.deepEqual(junk.filters.outWin, []);
  assert.deepEqual(parseHash('#/search?stops=0,7,x,2', site.rules).filters.stops, ['0', '2']);
  assert.equal(parseHash('', site.rules).view, 'home');
  assert.deepEqual(departSpec('2026-10-24'), { type: 'date', date: '2026-10-24' });
  assert.deepEqual(departSpec('whenever'), { type: 'anytime' });
});
