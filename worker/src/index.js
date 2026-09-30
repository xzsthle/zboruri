// Zboruri AI search — a Cloudflare Worker that keeps the Gemini API key secret.
// POST /api/search { text, today, destinations: [{ iata, name, country }], rates? }
//   → { intent }   (validated with the same rules the website uses)

import { sanitizeIntent } from '../../docs/js/intent.js';
import { buildGeminiRequest, geminiUrl, readGeminiText } from './gemini.js';

const MAX_TEXT = 300;
const MAX_DESTINATIONS = 150;
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_TIMEOUT_MS = 20_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IATA = /^[A-Z]{3}$/;

/** Fixed-window limiter per visitor. Per isolate, so it's a speed bump, not a hard quota. */
export function createLimiter({ limit, windowMs }, now = () => Date.now()) {
  const hits = new Map();
  return (key) => {
    const time = now();
    const entry = hits.get(key);
    if (!entry || time - entry.start > windowMs) {
      hits.set(key, { start: time, count: 1 });
      return true;
    }
    if (entry.count >= limit) return false;
    hits.set(key, { start: entry.start, count: entry.count + 1 });
    return true;
  };
}

const defaultLimiter = createLimiter({ limit: 20, windowMs: 60_000 });

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const json = (status, payload, headers = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const shortText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

/** Accepts only a small, well-formed request whose "today" is within two days of the server's date. */
function readInput(body, now) {
  const { text, today, destinations, rates } = body ?? {};
  if (!shortText(text?.trim?.(), MAX_TEXT) || text.length > MAX_TEXT) return null;
  if (!DATE.test(today ?? '') || Math.abs(Date.parse(`${today}T12:00:00Z`) - now.getTime()) > 2 * 86_400_000) return null;
  if (!Array.isArray(destinations) || destinations.length === 0 || destinations.length > MAX_DESTINATIONS) return null;
  const places = destinations.map((d) => ({ iata: d?.iata, name: d?.name, country: d?.country }));
  if (!places.every((d) => IATA.test(d.iata ?? '') && shortText(d.name, 80) && shortText(d.country, 60))) return null;
  const rate = (value) => (Number.isFinite(value) && value > 0 && value < 10_000 ? value : undefined);
  return { text: text.trim(), today, destinations: places, rates: { MDL: rate(rates?.MDL), RON: rate(rates?.RON), USD: rate(rates?.USD) } };
}

async function askGemini(input, env, fetchImpl) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const res = await fetchImpl(geminiUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(buildGeminiRequest(input)),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  return JSON.parse(readGeminiText(await res.json()));
}

export async function handle(request, env, { fetchImpl = fetch, limiter = defaultLimiter, now = () => new Date(), log = console.error } = {}) {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') ?? '';
  if (!allowed.includes(origin)) return json(403, { error: 'Origin not allowed' });
  const headers = corsHeaders(origin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/search') return json(404, { error: 'Not found' }, headers);
  if (!limiter(request.headers.get('CF-Connecting-IP') ?? 'unknown')) return json(429, { error: 'Too many requests — try again in a minute' }, headers);

  const input = readInput(await request.json().catch(() => null), now());
  if (!input) return json(400, { error: 'Invalid request' }, headers);
  if (!env.GEMINI_API_KEY) return json(503, { error: 'AI search is not configured' }, headers);

  try {
    const raw = await askGemini(input, env, fetchImpl);
    const intent = sanitizeIntent(raw, { today: input.today, validIatas: new Set(input.destinations.map((d) => d.iata)) });
    return json(200, { intent }, headers);
  } catch (error) {
    // Details go to the Worker logs only; the browser gets a generic message.
    log('gemini_failed', error.message);
    return json(502, { error: 'The AI could not answer right now' }, headers);
  }
}

export default { fetch: (request, env) => handle(request, env) };
