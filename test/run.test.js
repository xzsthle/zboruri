import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/run.js';
import { emptyState } from '../src/state.js';

const NOW = new Date('2026-09-29T05:00:00Z');
const BUD = { iata: 'BUD', name: 'Budapest', country: 'Hungary', countryCode: 'HU' };
const BGY = { iata: 'BGY', name: 'Milan Bergamo', country: 'Italy', countryCode: 'IT' };
const known = (destinations) => ({ version: 2, destinations });
const config = Object.freeze({
  origin: 'RMO', maxReturnPriceEur: 60, minNights: 2, maxNights: 5, daysAhead: 10, maxDealsPerDestination: 3, requestDelayMs: 0,
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
      origin: { iata: 'RMO', name: 'Chisinau', country: 'Moldova', countryCode: 'MD' },
      destinations: [BGY, BUD],
    }),
    getTimetable: async (version, origin, dest) => {
      if (failing.includes(dest)) throw new Error('blocked');
      return timetables[dest];
    },
  };
}

function memoryStore(initialState = emptyState()) {
  const writes = {};
  return {
    writes,
    readState: async () => initialState,
    writeState: async (state) => { writes.state = state; },
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
    getRates: async () => ({ EUR: 1, MDL: 20 }),
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

  assert.deepEqual(result, { deals: 1, alerts: 1, failed: [] });
  assert.equal(site.generatedAt, NOW.toISOString());
  assert.equal(site.origin.iata, 'RMO');
  assert.deepEqual(site.rules, { maxReturnPriceEur: 60, minNights: 2, maxNights: 5, daysAhead: 10 });
  assert.deepEqual(site.destinations.map((d) => d.iata), ['BUD', 'BGY'], 'destinations with deals come first');
  assert.equal(site.destinations[0].deals[0].totalEur, 40);
  assert.equal(site.destinations[0].dealSince, NOW.toISOString());
  assert.match(site.destinations[0].deals[0].bookingUrl, /select-flight\/RMO\/BUD\/2026-10-01\/2026-10-04/);
  assert.equal(site.destinations[1].cheapest.totalEur, 100);
  assert.equal(site.destinations[1].dealSince, null);
  assert.deepEqual(site.destinations[1].deals, []);
  assert.deepEqual(site.failed, []);

  assert.equal(deps.notifier.sent.length, 1);
  assert.match(deps.notifier.sent[0], /Budapest/);
  assert.deepEqual(state, known({ BUD: { priceEur: 40, since: NOW.toISOString(), alerted: true } }));
});

test('run does not alert again for a destination already alerted at this price', async () => {
  const before = known({ BUD: { priceEur: 40, since: '2026-09-28T05:00:00.000Z', alerted: true } });
  const deps = makeDeps({ store: memoryStore(before) });
  const result = await run(deps);
  assert.equal(result.alerts, 0);
  assert.equal(deps.notifier.sent.length, 0);
  assert.equal(deps.store.writes.site.destinations[0].dealSince, '2026-09-28T05:00:00.000Z');
});

test('run alerts again when a destination gets at least €1 cheaper', async () => {
  const deps = makeDeps({ store: memoryStore(known({ BUD: { priceEur: 45, since: 'old', alerted: true } })) });
  const result = await run(deps);
  assert.equal(result.alerts, 1);
  assert.equal(deps.store.writes.state.destinations.BUD.priceEur, 40);
});

test('run forgets destinations without deals, but keeps ones that failed to scan', async () => {
  const before = known({ BGY: { priceEur: 55, since: 'old', alerted: true } });
  const cleared = makeDeps({ store: memoryStore(before) });
  await run(cleared);
  assert.equal(cleared.store.writes.state.destinations.BGY, undefined);

  const failing = makeDeps({ store: memoryStore(before), wizz: fakeWizz(['BGY']) });
  await run(failing);
  assert.deepEqual(failing.store.writes.state.destinations.BGY, before.destinations.BGY);
});

test('run still publishes but keeps deals unalerted and rethrows when Telegram fails', async () => {
  const deps = makeDeps({ notifier: fakeNotifier({ fail: true }) });
  await assert.rejects(run(deps), /Telegram API error/);
  assert.ok(deps.store.writes.site, 'site data is still written');
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
