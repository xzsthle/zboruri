// A search "intent" — what a typed request asks for — produced by the offline parser or by Gemini.
// Everything is re-validated here, so neither source can inject unknown airports, odd dates or huge numbers.
//
// { language, destinations: [IATA], label, departFrom, departTo, minNights, maxNights,
//   weekendOnly, maxPrice, adults, sort, reply, understood }   ('' / 0 mean "not specified")

import { DEFAULT_FILTERS, DEFAULT_QUERY } from './query.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SORTS = new Set(['best', 'cheapest', 'soonest']);
const DAY_MS = 86_400_000;
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const clampInt = (value, min, max) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function dateWithin(value, today) {
  return typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value)) && value >= today && value <= addDays(today, 365);
}

function dateRange(raw, today) {
  let from = dateWithin(raw.departFrom, today) ? raw.departFrom : '';
  let to = dateWithin(raw.departTo, today) ? raw.departTo : '';
  if (from && !to) to = from;
  if (to && !from) from = to;
  return from > to ? [to, from] : [from, to];
}

function nights(raw) {
  let min = clampInt(raw.minNights ?? 0, 0, 30);
  let max = clampInt(raw.maxNights ?? 0, 0, 30);
  if (min && !max) max = min;
  if (min > max && max) [min, max] = [max, min];
  return [min, max];
}

export function sanitizeIntent(raw, { today, validIatas }) {
  const source = raw !== null && typeof raw === 'object' ? raw : {};
  const [departFrom, departTo] = dateRange(source, today);
  const [minNights, maxNights] = nights(source);
  const price = Number(source.maxPrice ?? source.maxPricePerPersonEur ?? 0);
  const destinations = Array.isArray(source.destinations)
    ? [...new Set(source.destinations.map((code) => String(code).toUpperCase()))].filter((code) => validIatas.has(code)).slice(0, 40)
    : [];
  return {
    language: source.language === 'ro' ? 'ro' : 'en',
    destinations,
    label: text(source.label, 60),
    departFrom,
    departTo,
    minNights,
    maxNights,
    weekendOnly: source.weekendOnly === true,
    maxPrice: Number.isFinite(price) && price > 0 ? Math.min(10_000, Math.round(price * 100) / 100) : 0,
    adults: clampInt(source.adults ?? 0, 0, 9),
    sort: SORTS.has(source.sort) ? source.sort : 'best',
    reply: text(source.reply, 200),
    understood: source.understood !== false,
  };
}

const lastDayOfMonth = (iso) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate();
const isWholeMonth = (from, to) =>
  from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01') && Number(to.slice(8)) === lastDayOfMonth(to);

function departParam({ departFrom: from, departTo: to }) {
  if (!from) return 'anytime';
  if (from === to) return from;
  return isWholeMonth(from, to) ? from.slice(0, 7) : `${from}..${to}`;
}

/** Intent → the same { query, filters } the search widget produces, within the site's stay rules. */
export function intentToRoute(intent, rules) {
  const lo = rules.minNights;
  const hi = rules.maxNights;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const hasStay = intent.minNights || intent.maxNights;
  const min = hasStay ? clamp(intent.minNights || lo, lo, hi) : lo;
  const max = hasStay ? clamp(intent.maxNights || intent.minNights || hi, min, hi) : hi;
  return {
    query: {
      ...DEFAULT_QUERY,
      to: intent.destinations.length ? intent.destinations.join(',') : 'anywhere',
      depart: departParam(intent),
      min,
      max,
      adults: intent.adults || 1,
      label: intent.label,
      note: intent.reply,
    },
    filters: { ...DEFAULT_FILTERS, sort: intent.sort, maxPrice: intent.maxPrice || null, weekend: intent.weekendOnly },
  };
}
