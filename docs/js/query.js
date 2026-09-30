// The search query and result filters, serialised in the URL hash so every view can be shared.
//   #/                                      home
//   #/search?to=SOF&depart=2026-10&min=2&max=10&adults=1   results

export const DEFAULT_QUERY = Object.freeze({ to: 'anywhere', depart: 'anytime', back: '', min: 2, max: 10, adults: 1, others: true });
export const DEFAULT_FILTERS = Object.freeze({ sort: 'best', airlines: [], outWin: [], backWin: [], maxPrice: null, weekend: false });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const IATA = /^[A-Z]{3}$/;
const SORTS = new Set(['best', 'cheapest', 'soonest']);
const WINDOWS = new Set(['night', 'morning', 'afternoon', 'evening']);

const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const list = (value, allowed) => (value ? value.split(',').filter((item) => allowed(item)) : []);

/** Depart spec: { type: 'anytime' } | { type: 'month', month } | { type: 'date', date } */
export function departSpec(depart) {
  if (DATE.test(depart)) return { type: 'date', date: depart };
  if (MONTH.test(depart)) return { type: 'month', month: depart };
  return { type: 'anytime' };
}

export function parseHash(hash, rules) {
  const [path, search = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(search);
  const minNights = rules?.minNights ?? DEFAULT_QUERY.min;
  const maxNights = rules?.maxNights ?? DEFAULT_QUERY.max;
  const min = clampInt(params.get('min'), minNights, maxNights, minNights);
  const query = {
    to: IATA.test(params.get('to') ?? '') ? params.get('to') : 'anywhere',
    depart: DATE.test(params.get('depart') ?? '') || MONTH.test(params.get('depart') ?? '') ? params.get('depart') : 'anytime',
    back: DATE.test(params.get('back') ?? '') ? params.get('back') : '',
    min,
    max: clampInt(params.get('max'), min, maxNights, maxNights),
    adults: clampInt(params.get('adults'), 1, 9, 1),
    others: params.get('others') !== '0',
  };
  const filters = {
    sort: SORTS.has(params.get('sort')) ? params.get('sort') : 'best',
    airlines: list(params.get('air'), (name) => name.length <= 60),
    outWin: list(params.get('dep'), (w) => WINDOWS.has(w)),
    backWin: list(params.get('ret'), (w) => WINDOWS.has(w)),
    maxPrice: params.has('maxp') ? clampInt(params.get('maxp'), 1, 100_000, null) : null,
    weekend: params.get('wknd') === '1',
  };
  return { view: path.startsWith('/search') ? 'search' : 'home', query, filters };
}

export function toHash(query, filters = DEFAULT_FILTERS) {
  const params = new URLSearchParams();
  const put = (key, value, skip) => { if (value !== skip && value !== '' && value != null) params.set(key, String(value)); };
  put('to', query.to, 'anywhere');
  put('depart', query.depart, 'anytime');
  put('back', query.back, '');
  put('min', query.min);
  put('max', query.max);
  put('adults', query.adults, 1);
  if (!query.others) params.set('others', '0');
  put('sort', filters.sort, 'best');
  put('air', filters.airlines.join(','), '');
  put('dep', filters.outWin.join(','), '');
  put('ret', filters.backWin.join(','), '');
  put('maxp', filters.maxPrice, null);
  if (filters.weekend) params.set('wknd', '1');
  return `#/search?${params}`;
}
