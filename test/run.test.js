import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.js';
import { emptyState } from '../src/state.js';
import { emptyHistory } from '../src/history.js';
import { TravelpayoutsAuthError } from '../src/travelpayouts.js';

const NOW = new Date('2026-09-29T05:00:00Z');
const BUD = { iata: 'BUD', name: 'Budapest', country: 'Hungary', countryCode: 'HU', lat: 47.4, lon: 19.2 };
const BGY = { iata: 'BGY', name: 'Milan Bergamo', country: 'Italy', countryCode: 'IT', lat: 45.7, lon: 9.7 };
const SAW = { iata: 'SAW', name: 'Istanbul', country: 'Turkey', countryCode: 'TR', lat: 40.9, lon: 29.3 };
const known = (destinations) => ({ version: 2, destinations });
const config = Object.freeze({
  origin: 'RMO', maxReturnPriceEur: 60, minNights: 2, maxNights: 5, daysAhead: 10,
  maxDealsPerDestination: 3, requestDelayMs: 0, directFlightsOnly: true,
});
const fare = (date, amount) => ({ date, times: ['10:00'], amount, currency: 'MDL' });
const TIMETABLES = {
  BUD: { outbound: [fare('2026-10-01', 400)], inbound: [fare('2026-10-04', 400)] }, // €40 return
  BGY: { outbound: [fare('2026-10-02', 1000)], inbound: [fare('2026-10-05', 1000)] }, // €100 return
};

function fakeWizz(failing = [], timetables = TIMETABLES) {
  return {
    getApiVersion: async () => '1.0.0',
    getRouteMap: async () => ({
      origin: { iata: 'RMO', name: 'Chisinau', country: 'Moldova', countryCode: 'MD', lat: 46.9, lon: 28.9 },
      destinations: [BGY, BUD],
    }),
    getTimetable: async (version, origin, dest) => {
      if (failing.includes(dest)) throw new Error('blocked');
      return timetables[dest];
    },
  };
}

function fakeTravelpayouts({ fail = null } = {}) {
  const tpTrip = {
    outDate: '2026-10-03', outTimes: ['06:30'], backDate: '2026-10-06', backTimes: ['21:05'],
    nights: 3, totalEur: 35, airlineCode: 'VF', stops: 0, bookingUrl: 'https://www.aviasales.com/search/x', source: 'travelpayouts',
  };
  return {
    fetchReference: async () => ({
      placeFor: (iata) => ({ SAW })[iata] ?? null,
      airlineName: (code) => ({ VF: 'Ajet' })[code] ?? null,
    }),
    fetchTrips: async () => {
      if (fail) throw fail;
      return [{ destIata: 'SAW', trip: tpTrip }];
    },
  };
}

function memoryStore({ state = emptyState(), history = emptyHistory() } = {}) {
  const writes = {};
  return {
    writes,
    readState: async () => state,
    writeState: async (value) => { writes.state = value; },
    readHistory: async () => history,
    writeHistory: async (value) => { writes.history = value; },
    writeSiteData: async (data) => { writes.site = data; },
  };
}

function fakeNotifier({ fail = false } = {}) {
  const sent = [];
  return {
    sent,
    send: async (text) => {
      if (fail) throw new Error('Telegram API error (HTTP 401): Unauthorized');
      sent.push(text);
    },
  };
}

function makeDeps(overrides = {}) {
  const warnings = [];
  return {
    warnings,
    config,
    wizz: fakeWizz(),
    travelpayouts: null,
    getRates: async () => ({ EUR: 1, MDL: 20, RON: 5, USD: 1.1, GBP: 0.9 }),
    notifier: fakeNotifier(),
    store: memoryStore(),
    clock: { now: () => NOW },
    pause: async () => {},
    cooldown: async () => {},
    log: { info() {}, warn: (msg) => warnings.push(msg), error: (msg) => warnings.push(msg) },
    siteUrl: 'https://me.github.io/zboruri/',
    ...overrides,
  };
}

test('run publishes every destination, alerts new deals and remembers them', async () => {
  const deps = makeDeps();
  const result = await run(deps);
  const { site, state } = deps.store.writes;

  assert.deepEqual(result, { deals: 1, alerts: 1, failed: [], otherAirlines: { status: 'off' } });
  assert.equal(site.generatedAt, NOW.toISOString());
  assert.equal(site.origin.iata, 'RMO');
  assert.deepEqual(site.rules, { maxReturnPriceEur: 60, minNights: 2, maxNights: 5, daysAhead: 10 });
  assert.deepEqual(site.rates, { EUR: 1, MDL: 20, RON: 5, USD: 1.1 });
  assert.deepEqual(site.sources, [{ id: 'wizz', name: 'Wizz Air', live: true }]);
  assert.deepEqual(site.destinations.map((d) => d.iata), ['BUD', 'BGY'], 'destinations with deals come first');
  const [bud, bgy] = site.destinations;
  assert.equal(bud.deals[0].totalEur, 40);
  assert.equal(bud.deals[0].airline, 'Wizz Air');
  assert.equal(bud.dealSince, NOW.toISOString());
  assert.equal(bud.lat, 47.4);
  assert.deepEqual(bud.calendar, [['2026-10-01', 40]]);
  assert.match(bud.deals[0].bookingUrl, /select-flight\/RMO\/BUD\/2026-10-01\/2026-10-04/);
  assert.equal(bgy.cheapest.totalEur, 100);
  assert.equal(bgy.dealSince, null);
  assert.deepEqual(bgy.deals, []);
  assert.deepEqual(site.failed, []);

  assert.equal(deps.notifier.sent.length, 1);
  assert.match(deps.notifier.sent[0], /Budapest/);
  assert.deepEqual(state, known({ BUD: { priceEur: 40, since: NOW.toISOString(), alerted: true } }));
});

test('run records the cheapest price per destination in the price history', async () => {
  const deps = makeDeps();
  await run(deps);
  assert.deepEqual(deps.store.writes.history.destinations, { BUD: [['2026-09-29', 40]], BGY: [['2026-09-29', 100]] });
});

test('run merges other airlines from Travelpayouts into the results', async () => {
  const deps = makeDeps({ travelpayouts: fakeTravelpayouts() });
  const result = await run(deps);
  const saw = deps.store.writes.site.destinations.find((d) => d.iata === 'SAW');

  assert.deepEqual(result.otherAirlines, { status: 'ok', trips: 1 });
  assert.equal(saw.name, 'Istanbul');
  assert.equal(saw.deals[0].airline, 'Ajet');
  assert.equal(saw.deals[0].totalEur, 35);
  assert.deepEqual(deps.store.writes.site.sources.map((s) => s.id), ['wizz', 'travelpayouts']);
  assert.equal(result.alerts, 2);
  assert.match(deps.notifier.sent[0], /Istanbul/);
});

test('run carries on with Wizz Air alone when Travelpayouts fails, and reports why', async () => {
  const deps = makeDeps({ travelpayouts: fakeTravelpayouts({ fail: new TravelpayoutsAuthError() }) });
  const result = await run(deps);
  assert.equal(result.otherAirlines.status, 'error');
  assert.match(result.otherAirlines.message, /rejected the API token/);
  assert.equal(result.otherAirlines.auth, true);
  assert.equal(deps.store.writes.site.destinations.length, 2);
  assert.match(deps.warnings.join('\n'), /Other airlines skipped/);
});

test('run does not alert again for a destination already alerted at this price', async () => {
  const before = known({ BUD: { priceEur: 40, since: '2026-09-28T05:00:00.000Z', alerted: true } });
  const deps = makeDeps({ store: memoryStore({ state: before }) });
  const result = await run(deps);
  assert.equal(result.alerts, 0);
  assert.equal(deps.notifier.sent.length, 0);
  assert.equal(deps.store.writes.site.destinations[0].dealSince, '2026-09-28T05:00:00.000Z');
});

test('run alerts again when a destination gets at least €1 cheaper', async () => {
  const deps = makeDeps({ store: memoryStore({ state: known({ BUD: { priceEur: 45, since: 'old', alerted: true } }) }) });
  const result = await run(deps);
  assert.equal(result.alerts, 1);
  assert.equal(deps.store.writes.state.destinations.BUD.priceEur, 40);
});

test('run forgets destinations without deals, but keeps ones that failed to scan', async () => {
  const before = known({ BGY: { priceEur: 55, since: 'old', alerted: true } });
  const cleared = makeDeps({ store: memoryStore({ state: before }) });
  await run(cleared);
  assert.equal(cleared.store.writes.state.destinations.BGY, undefined);

  const failing = makeDeps({ store: memoryStore({ state: before }), wizz: fakeWizz(['BGY']) });
  await run(failing);
  assert.deepEqual(failing.store.writes.state.destinations.BGY, before.destinations.BGY);
});

test('run still publishes but keeps deals unalerted and rethrows when Telegram fails', async () => {
  const deps = makeDeps({ notifier: fakeNotifier({ fail: true }) });
  await assert.rejects(run(deps), /Telegram API error/);
  assert.ok(deps.store.writes.site, 'site data is still written');
  assert.ok(deps.store.writes.history, 'price history is still written');
  assert.equal(deps.store.writes.state.destinations.BUD.alerted, false);
});

test('run publishes without alerting when Telegram is not configured', async () => {
  const deps = makeDeps({ notifier: null });
  const result = await run(deps);
  assert.equal(result.alerts, 1);
  assert.equal(deps.store.writes.state.destinations.BUD.alerted, false);
  assert.match(deps.warnings.join('\n'), /Telegram is not configured/);
});

test('run reports destinations that failed when most still succeed', async () => {
  const deps = makeDeps({ wizz: fakeWizz(['BGY']) });
  const result = await run(deps);
  assert.deepEqual(result.failed, ['BGY']);
  assert.deepEqual(deps.store.writes.site.failed, ['BGY']);
});

test('run fails without overwriting data when most destinations cannot be scanned', async () => {
  const deps = makeDeps({ wizz: fakeWizz(['BUD', 'BGY']) });
  await assert.rejects(run(deps), /Only 0 of 2 destinations could be scanned/);
  assert.equal(deps.store.writes.site, undefined);
  assert.equal(deps.store.writes.state, undefined);
});

test('run fails without overwriting data when Wizz Air returns no prices at all', async () => {
  const empty = { outbound: [], inbound: [] };
  const deps = makeDeps({ wizz: fakeWizz([], { BUD: empty, BGY: empty }) });
  await assert.rejects(run(deps), /no prices for any route/);
  assert.equal(deps.store.writes.site, undefined);
});
