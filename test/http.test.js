import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, HttpError } from '../src/http.js';

const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const noWait = async () => {};

test('getJson retries a 503 and returns the next successful response', async () => {
  const responses = [reply(503, 'busy'), reply(200, { ok: true })];
  let calls = 0;
  const http = createHttp({ fetchImpl: async () => { calls += 1; return responses.shift(); }, wait: noWait });
  assert.deepEqual(await http.getJson('https://api.test/a'), { ok: true });
  assert.equal(calls, 2);
});

test('retries a 429 rate-limit response', async () => {
  const responses = [reply(429, 'slow down'), reply(200, 'hello')];
  const http = createHttp({ fetchImpl: async () => responses.shift(), wait: noWait });
  assert.equal(await http.getText('https://api.test/a'), 'hello');
});

test('does not retry a 400 and exposes status and body in the error', async () => {
  let calls = 0;
  const http = createHttp({
    fetchImpl: async () => { calls += 1; return reply(400, '{"validationCodes":["InvalidTimeDateRange"]}'); },
    wait: noWait,
  });
  await assert.rejects(http.postJson('https://api.test/search', {}), (err) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 400);
    assert.match(err.message, /HTTP 400 from api\.test\/search: .*InvalidTimeDateRange/);
    return true;
  });
  assert.equal(calls, 1);
});

test('gives up after the configured retries on network errors, backing off exponentially', async () => {
  let calls = 0;
  const waits = [];
  const http = createHttp({
    fetchImpl: async () => { calls += 1; throw new TypeError('fetch failed'); },
    wait: async (ms) => { waits.push(ms); },
    retries: 2,
    backoffMs: 100,
  });
  await assert.rejects(http.getText('https://api.test/a'), /fetch failed/);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [100, 200]);
});

test('postJson sends a JSON body with default and per-call headers', async () => {
  let seen;
  const http = createHttp({
    fetchImpl: async (url, init) => { seen = { url, init }; return reply(200, { ok: 1 }); },
    headers: { 'User-Agent': 'UA' },
  });
  await http.postJson('https://api.test/p', { a: 1 }, { headers: { Origin: 'https://o.test' } });
  assert.equal(seen.url, 'https://api.test/p');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.body, '{"a":1}');
  assert.equal(seen.init.headers['User-Agent'], 'UA');
  assert.equal(seen.init.headers.Origin, 'https://o.test');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  assert.ok(seen.init.signal instanceof AbortSignal);
});
