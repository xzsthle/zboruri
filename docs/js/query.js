// The search query and result filters, serialised in the URL hash so every view can be shared.
//   #/                                      home
//   #/search?to=SOF&depart=2026-10&min=2&max=10&adults=1   results

export const DEFAULT_QUERY = Object.freeze({ to: 'anywhere', depart: 'anytime', back: '', min: 2, max: 10, adults: 1, others: true, label: '', note: '' });
// stops: '0' direct, '1' one stop, '2' two or more (the most stops in either direction); empty = any.
export const DEFAULT_FILTERS = Object.freeze({ sort: 'best', airlines: [], outWin: [], backWin: [], maxPrice: null, weekend: false, stops: [] });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RANGE = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
const MONTH = /^\d{4}-\d{2}$/;
const IATA = /^[A-Z]{3}$/;
const SORTS = new Set(['best', 'cheapest', 'soonest']);
const WINDOWS = new Set(['night', 'morning', 'afternoon', 'evening']);
const STOP_CLASSES = new Set(['0', '1', '2']);

const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const list = (value, allowed) => (value ? value.split(',').filter((item) => allowed(item)) : []);

/** Depart spec: { type: 'anytime' } | { type: 'month', month } | { type: 'date', date } | { type: 'range', from, to } */
export function departSpec(depart) {
  const range = RANGE.exec(depart ?? '');
  if (range && range[1] <= range[2]) return { type: 'range', from: range[1], to: range[2] };
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
  const destinations = (params.get('to') ?? '').split(',').filter((code) => IATA.test(code)).slice(0, 40);
  const depart = params.get('depart') ?? '';
  const query = {
    to: destinations.length ? destinations.join(',') : 'anywhere',
    depart: departSpec(depart).type !== 'anytime' || MONTH.test(depart) ? depart : 'anytime',
    back: DATE.test(params.get('back') ?? '') ? params.get('back') : '',
    min,
    max: clampInt(params.get('max'), min, maxNights, maxNights),
    adults: clampInt(params.get('adults'), 1, 9, 1),
    others: params.get('others') !== '0',
    // Display-only text from the "Ask" box; rendered as text, never as HTML.
    label: (params.get('label') ?? '').slice(0, 60),
    note: (params.get('note') ?? '').slice(0, 200),
  };
  const filters = {
    sort: SORTS.has(params.get('sort')) ? params.get('sort') : 'best',
    airlines: list(params.get('air'), (name) => name.length <= 60),
    outWin: list(params.get('dep'), (w) => WINDOWS.has(w)),
    backWin: list(params.get('ret'), (w) => WINDOWS.has(w)),
    maxPrice: params.has('maxp') ? clampInt(params.get('maxp'), 1, 100_000, null) : null,
    weekend: params.get('wknd') === '1',
    stops: list(params.get('stops'), (s) => STOP_CLASSES.has(s)),
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
  put('label', query.label, '');
  put('note', query.note, '');
  put('sort', filters.sort, 'best');
  put('air', filters.airlines.join(','), '');
  put('dep', filters.outWin.join(','), '');
  put('ret', filters.backWin.join(','), '');
  put('maxp', filters.maxPrice, null);
  if (filters.weekend) params.set('wknd', '1');
  put('stops', (filters.stops ?? []).join(','), '');
  return `#/search?${params}`;
}
