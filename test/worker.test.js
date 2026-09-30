import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, handle } from '../worker/src/index.js';
import { buildGeminiRequest, readGeminiText } from '../worker/src/gemini.js';

const ORIGIN = 'https://xzsthle.github.io';
const env = { ALLOWED_ORIGINS: `${ORIGIN},http://localhost:8080`, GEMINI_API_KEY: 'secret-key', GEMINI_MODEL: 'gemini-test' };
const now = () => new Date('2026-09-30T10:00:00Z');
const destinations = [{ iata: 'ALC', name: 'Alicante', country: 'Spain' }, { iata: 'LCA', name: 'Larnaca', country: 'Cyprus' }];
const body = { text: 'beach next week under 80 euro', today: '2026-09-30', destinations, rates: { MDL: 20, RON: 5, USD: 1.1 } };

const request = (payload, { origin = ORIGIN, method = 'POST', path = '/api/search' } = {}) => new Request(`https://zboruri-ai.test${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '1.2.3.4' },
  body: method === 'POST' ? JSON.stringify(payload) : undefined,
});

const geminiReply = (intent) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(intent) }] }, finishReason: 'STOP' }],
}), { status: 200 });

const allowAll = () => true;

test('answers the CORS preflight only for allowed origins', async () => {
  const ok = await handle(request(null, { method: 'OPTIONS' }), env, { limiter: allowAll, now });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const denied = await handle(request(body, { origin: 'https://evil.test' }), env, { limiter: allowAll, now });
  assert.equal(denied.status, 403);
});

test('rejects unknown paths, bad input and stale dates', async () => {
  assert.equal((await handle(request(body, { path: '/other' }), env, { limiter: allowAll, now })).status, 404);
  assert.equal((await handle(request({ ...body, text: 'x'.repeat(301) }), env, { limiter: allowAll, now })).status, 400);
  assert.equal((await handle(request({ ...body, destinations: [{ iata: 'bad' }] }), env, { limiter: allowAll, now })).status, 400);
  assert.equal((await handle(request({ ...body, today: '2020-01-01' }), env, { limiter: allowAll, now })).status, 400);
});

test('asks Gemini with the key in a header and returns a validated intent', async () => {
  let call;
  const fetchImpl = async (url, init) => {
    call = { url, init };
    return geminiReply({
      language: 'en', destinations: ['ALC', 'LCA', 'ZZZ'], label: 'Beach destinations', departFrom: '2026-10-05', departTo: '2026-10-11',
      minNights: 0, maxNights: 0, weekendOnly: false, maxPricePerPersonEur: 80, adults: 0, sort: 'best', reply: 'Beach trips next week under €80.',
    });
  };
  const res = await handle(request(body), env, { fetchImpl, limiter: allowAll, now });
  assert.equal(res.status, 200);
  const { intent } = await res.json();
  assert.deepEqual(intent.destinations, ['ALC', 'LCA'], 'an invented airport code is dropped');
  assert.equal(intent.maxPrice, 80);
  assert.match(call.url, /models\/gemini-test:generateContent$/);
  assert.doesNotMatch(call.url, /secret-key/);
  assert.equal(call.init.headers['x-goog-api-key'], 'secret-key');
  const sent = JSON.parse(call.init.body);
  assert.match(sent.systemInstruction.parts[0].text, /ALC — Alicante, Spain/);
  assert.equal(sent.contents[0].parts[0].text, body.text);
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
});

test('hides Gemini failures behind a generic 502', async () => {
  const fetchImpl = async () => new Response('quota exceeded for key secret-key', { status: 429 });
  const res = await handle(request(body), env, { fetchImpl, limiter: allowAll, now, log: () => {} });
  assert.equal(res.status, 502);
  assert.doesNotMatch(await res.text(), /secret-key|quota/);
});

test('rate-limits per visitor and needs a configured key', async () => {
  assert.equal((await handle(request(body), env, { limiter: () => false, now })).status, 429);
  assert.equal((await handle(request(body), { ...env, GEMINI_API_KEY: '' }, { limiter: allowAll, now })).status, 503);
});

test('createLimiter allows a burst per key and resets after the window', () => {
  let t = 0;
  const limiter = createLimiter({ limit: 2, windowMs: 1000 }, () => t);
  assert.deepEqual([limiter('a'), limiter('a'), limiter('a'), limiter('b')], [true, true, false, true]);
  t = 1001;
  assert.equal(limiter('a'), true);
});

test('the Gemini request lists destinations and rates; empty answers are errors', () => {
  const req = buildGeminiRequest(body);
  assert.match(req.systemInstruction.parts[0].text, /Today is 2026-09-30 \(Wednesday\)/);
  assert.match(req.systemInstruction.parts[0].text, /20 MDL/);
  assert.equal(req.generationConfig.responseSchema.type, 'OBJECT');
  assert.throws(() => readGeminiText({ candidates: [] }), /no answer/);
  assert.equal(readGeminiText({ candidates: [{ content: { parts: [{ text: '{"a"' }, { text: ':1}' }] } }] }), '{"a":1}');
});
