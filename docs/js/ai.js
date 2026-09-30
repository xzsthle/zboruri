// Understanding a typed request: Gemini (through the Worker) when available, instant parsing otherwise.

import { AI_ENDPOINT } from './config.js';
import { parseQuery } from './nl-parser.js';
import { sanitizeIntent } from './intent.js';

const TIMEOUT_MS = 15_000;
const MAX_AI_DESTINATIONS = 400;
const pad = (n) => String(n).padStart(2, '0');
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function askGemini(text, site, today) {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      today,
      // The Worker accepts up to 500; the list is already ordered deals first, cheapest first.
      destinations: site.destinations.slice(0, MAX_AI_DESTINATIONS).map(({ iata, name, country }) => ({ iata, name, country })),
      rates: site.rates,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`AI search HTTP ${res.status}`);
  return (await res.json()).intent;
}

/**
 * Returns { intent, source: 'gemini' | 'instant', error? }. Any AI failure falls back to the
 * instant parser, and both answers go through the same validation.
 */
export async function understand(text, site) {
  const today = localToday();
  const check = (raw) => sanitizeIntent(raw, { today, validIatas: new Set(site.destinations.map((d) => d.iata)) });
  const instant = check(parseQuery(text, { today, destinations: site.destinations, rates: site.rates }));
  if (!AI_ENDPOINT) return { intent: instant, source: 'instant' };
  try {
    return { intent: check(await askGemini(text, site, today)), source: 'gemini' };
  } catch (error) {
    return { intent: instant, source: 'instant', error };
  }
}

export const aiEnabled = () => Boolean(AI_ENDPOINT);
