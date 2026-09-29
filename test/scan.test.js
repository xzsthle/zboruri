import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanAll, scanDestination } from '../src/scan.js';

const windows = [{ from: '2026-10-01', to: '2026-11-11' }, { from: '2026-11-12', to: '2026-12-23' }];
const quietLog = { info() {}, warn() {} };

test('scanDestination requests every window, pauses after each, and merges fares', async () => {
  const calls = [];
  let pauses = 0;
  const wizz = {
    getTimetable: async (version, origin, dest, window) => {
      calls.push([version, origin, dest, window.from]);
      return { outbound: [{ date: window.from }], inbound: [{ date: window.to }] };
    },
  };
  const result = await scanDestination({
    wizz, version: '1', origin: 'RMO', dest: { iata: 'BUD' }, windows, pause: async () => { pauses += 1; },
  });
  assert.deepEqual(calls, [['1', 'RMO', 'BUD', '2026-10-01'], ['1', 'RMO', 'BUD', '2026-11-12']]);
  assert.equal(pauses, 2);
  assert.deepEqual(result, {
    dest: { iata: 'BUD' },
    outbound: [{ date: '2026-10-01' }, { date: '2026-11-12' }],
    inbound: [{ date: '2026-11-11' }, { date: '2026-12-23' }],
  });
});

test('scanAll keeps going when a destination fails and reports which ones failed', async () => {
  const warnings = [];
  const wizz = {
    getTimetable: async (version, origin, dest) => {
      if (dest === 'BUD') throw new Error('HTTP 403');
      return { outbound: [], inbound: [] };
    },
  };
  const { results, failed } = await scanAll({
    wizz, version: '1', origin: 'RMO', windows: windows.slice(0, 1), pause: async () => {}, cooldown: async () => {},
    destinations: [{ iata: 'BUD' }, { iata: 'VCE' }],
    log: { ...quietLog, warn: (msg) => warnings.push(msg) },
  });
  assert.deepEqual(results.map((r) => r.dest.iata), ['VCE']);
  assert.deepEqual(failed, ['BUD']);
  assert.match(warnings[0], /BUD.*HTTP 403/);
});

test('scanAll retries failed destinations once after a cool-down', async () => {
  let budCalls = 0;
  let cooldowns = 0;
  const wizz = {
    getTimetable: async (version, origin, dest) => {
      if (dest === 'BUD' && (budCalls += 1) === 1) throw new Error('HTTP 503');
      return { outbound: [], inbound: [] };
    },
  };
  const { results, failed } = await scanAll({
    wizz, version: '1', origin: 'RMO', windows: windows.slice(0, 1), pause: async () => {},
    cooldown: async () => { cooldowns += 1; },
    destinations: [{ iata: 'BUD' }, { iata: 'VCE' }],
    log: quietLog,
  });
  assert.deepEqual(results.map((r) => r.dest.iata), ['VCE', 'BUD']);
  assert.deepEqual(failed, []);
  assert.equal(cooldowns, 1);
});

test('scanAll stops early when failures come in a row, so an outage cannot exhaust the job time limit', async () => {
  let calls = 0;
  const warnings = [];
  const wizz = { getTimetable: async () => { calls += 1; throw new Error('timeout'); } };
  const destinations = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((iata) => ({ iata }));
  const { results, failed } = await scanAll({
    wizz, version: '1', origin: 'RMO', windows: windows.slice(0, 1), pause: async () => {}, cooldown: async () => {},
    destinations, maxConsecutiveFailures: 3,
    log: { ...quietLog, warn: (msg) => warnings.push(msg) },
  });
  assert.equal(calls, 6, '3 attempts in the first pass, 3 in the retry pass');
  assert.deepEqual(results, []);
  assert.deepEqual(failed, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.match(warnings.join('\n'), /Stopping after 3 failures in a row/);
});

test('scanAll skips the cool-down when nothing failed', async () => {
  let cooldowns = 0;
  const wizz = { getTimetable: async () => ({ outbound: [], inbound: [] }) };
  const { failed } = await scanAll({
    wizz, version: '1', origin: 'RMO', windows: windows.slice(0, 1), pause: async () => {},
    cooldown: async () => { cooldowns += 1; },
    destinations: [{ iata: 'VCE' }],
    log: quietLog,
  });
  assert.deepEqual(failed, []);
  assert.equal(cooldowns, 0);
});
