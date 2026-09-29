// Renders docs/data/deals.json (written by the scanner) as a departures board.
// All data goes through textContent / setAttribute — never innerHTML.

const DATA_URL = 'data/deals.json';
const BOOKING_PREFIX = 'https://www.wizzair.com/';
const NEW_FOR_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ORIGIN_NAMES = { RMO: 'Chișinău' };

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') Object.entries(value).forEach(([prop, v]) => el.style.setProperty(prop, v));
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}

// ---------- formatting ----------

const parseDay = (iso) => new Date(`${iso}T00:00:00Z`);
const fmtEur = (amount) => `€${Math.round(amount)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const safeBookingUrl = (url) => (typeof url === 'string' && url.startsWith(BOOKING_PREFIX) ? url : null);

function fmtDay(iso) {
  const d = parseDay(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}`;
}

function fmtMonth(key, currentYear) {
  const [year, month] = key.split('-').map(Number);
  const label = MONTHS[month - 1];
  return year === currentYear ? label : `${label} ’${String(year).slice(2)}`;
}

function fmtAgo(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function flagEmoji(code) {
  if (!/^[A-Z]{2}$/.test(code ?? '')) return '🌍';
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// ---------- data shaping ----------

function allDeals(data) {
  return data.destinations
    .flatMap((dest) => dest.deals.map((trip) => ({ dest, trip })))
    .sort((a, b) => a.trip.totalEur - b.trip.totalEur || a.trip.outDate.localeCompare(b.trip.outDate));
}

/** One entry per destination, in the order of each destination's cheapest trip. */
function groupByDestination(deals) {
  const groups = new Map();
  deals.forEach((deal) => groups.set(deal.dest.iata, [...(groups.get(deal.dest.iata) ?? []), deal]));
  return [...groups.values()];
}

// dealSince = when this destination got a deal or got cheaper.
const isFresh = (dest, generatedAt) =>
  Boolean(dest.dealSince) && Date.parse(generatedAt) - Date.parse(dest.dealSince) < NEW_FOR_MS;

function monthCounts(deals) {
  const counts = new Map();
  deals.forEach(({ trip }) => counts.set(trip.outDate.slice(0, 7), (counts.get(trip.outDate.slice(0, 7)) ?? 0) + 1));
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const readMonth = () => new URLSearchParams(location.search).get('month');

function writeMonth(month) {
  const url = new URL(location.href);
  if (month) url.searchParams.set('month', month);
  else url.searchParams.delete('month');
  history.replaceState(null, '', url);
}

// ---------- rendering ----------

function renderMasthead(data, deals) {
  const origin = ORIGIN_NAMES[data.origin.iata] ?? data.origin.name;
  const limit = fmtEur(data.rules.maxReturnPriceEur);
  $('headline').replaceChildren('Where can ', h('em', {}, limit), ` take you from ${origin}?`);
  $('lede').textContent =
    `Every morning and evening, all ${data.destinations.length} Wizz Air routes out of ${data.origin.iata} are checked ` +
    `for return trips of ${data.rules.minNights}–${data.rules.maxNights} nights in the next ${data.rules.daysAhead} days.`;
  $('deals-heading').textContent = `Departures under ${limit}`;

  const withDeals = data.destinations.filter((d) => d.deals.length > 0).length;
  $('stat-deals').textContent = String(deals.length);
  $('stat-cheapest').textContent = deals.length > 0 ? fmtEur(deals[0].trip.totalEur) : '—';
  $('stat-routes').textContent = `${withDeals} / ${data.destinations.length}`;
  $('stat-updated').replaceChildren(h('time', { datetime: data.generatedAt, title: new Date(data.generatedAt).toLocaleString() }, fmtAgo(data.generatedAt)));
}

function renderMonths(data, deals, onChange) {
  const active = readMonth();
  const year = new Date(data.generatedAt).getUTCFullYear();
  const chip = (month, label, count) =>
    h('button', { class: 'chip', type: 'button', 'aria-pressed': String(month === active) }, label, h('span', { class: 'chip-count' }, String(count)));

  const chips = [
    [null, 'All', deals.length],
    ...monthCounts(deals).map(([month, count]) => [month, fmtMonth(month, year), count]),
  ].map(([month, label, count]) => {
    const button = chip(month, label, count);
    button.addEventListener('click', () => { writeMonth(month); onChange(); });
    return button;
  });
  $('months').replaceChildren(...(chips.length > 1 ? chips : []));
}

function leg(className, label, date, times) {
  return h('div', { class: `leg ${className}` },
    h('span', { class: 'cell-label' }, label),
    h('time', { datetime: date }, fmtDay(date)),
    h('span', { class: 'leg-time' }, times?.[0] ?? ''),
  );
}

function bookLink(className, url, label, srText) {
  return url && h('a', { class: className, href: url, target: '_blank', rel: 'noopener noreferrer' },
    label, h('span', { class: 'sr-only' }, srText));
}

function moreDates(dest, others) {
  if (others.length === 0) return null;
  return h('details', { class: 'more' },
    h('summary', {}, `${plural(others.length, 'more date')} to ${dest.name}`),
    h('ul', { class: 'more-list' }, others.map(({ trip }) => h('li', {},
      h('span', {}, `${fmtDay(trip.outDate)} → ${fmtDay(trip.backDate)}`),
      h('span', { class: 'more-nights' }, plural(trip.nights, 'night')),
      h('span', { class: 'more-price' }, fmtEur(trip.totalEur)),
      bookLink('more-book', safeBookingUrl(trip.bookingUrl), 'Book ↗',
        ` ${dest.name}, ${fmtDay(trip.outDate)} to ${fmtDay(trip.backDate)}, on Wizz Air`),
    ))),
  );
}

function dealRow([{ dest, trip }, ...others], index, { generatedAt, showNew }) {
  const isNew = showNew && isFresh(dest, generatedAt);
  const url = safeBookingUrl(trip.bookingUrl);
  return h('li', { class: 'row', style: { '--i': String(index) } },
    h('div', { class: 'dest' },
      h('span', { class: 'flag', 'aria-hidden': 'true' }, flagEmoji(dest.countryCode)),
      h('span', { class: 'city' }, dest.name),
      h('span', { class: 'country' }, `${dest.country} · ${dest.iata}`),
    ),
    leg('out', 'Out', trip.outDate, trip.outTimes),
    leg('back', 'Back', trip.backDate, trip.backTimes),
    h('div', { class: 'stay' }, h('span', { class: 'cell-label' }, 'Stay'), plural(trip.nights, 'night')),
    h('div', { class: 'price' }, h('span', { class: 'flap' }, fmtEur(trip.totalEur))),
    h('div', { class: 'act' },
      isNew && h('span', { class: 'badge-new' }, 'New'),
      bookLink('book', url, 'Book ↗', ` ${dest.name}, ${fmtDay(trip.outDate)} to ${fmtDay(trip.backDate)}, on Wizz Air`),
    ),
    moreDates(dest, others),
  );
}

function emptyRow(data, deals) {
  const limit = fmtEur(data.rules.maxReturnPriceEur);
  if (deals.length > 0) return h('li', { class: 'row row-status' }, 'No deals leave in this month. Try another one.');
  const best = data.destinations.find((d) => d.cheapest);
  return h('li', { class: 'row row-status' },
    `Nothing under ${limit} right now. `,
    best && h('span', {}, 'Closest: ', h('strong', {}, `${best.name} ${fmtEur(best.cheapest.totalEur)}`), '. '),
    'The next check runs in a few hours.',
  );
}

function renderDeals(data, deals) {
  const month = readMonth();
  const visible = month ? deals.filter(({ trip }) => trip.outDate.startsWith(month)) : deals;
  // On the very first scan every deal is new, so the badge would carry no information.
  const showNew = deals.some(({ dest }) => !isFresh(dest, data.generatedAt));
  const rows = groupByDestination(visible).map((group, i) => dealRow(group, i, { generatedAt: data.generatedAt, showNew }));
  $('deal-rows').replaceChildren(...(rows.length > 0 ? rows : [emptyRow(data, deals)]));
}

function routeTile(dest, limit) {
  const trip = dest.cheapest;
  if (!trip) {
    return h('li', { class: 'tile' }, h('div', { class: 'tile-empty' },
      h('span', { class: 'tile-code' }, dest.iata), h('span', { class: 'tile-name' }, dest.name), h('span', { class: 'tile-gap' }, 'No fares in range')));
  }
  const isDeal = trip.totalEur <= limit;
  const gap = isDeal ? `${fmtDay(trip.outDate)} → ${fmtDay(trip.backDate)}` : `${fmtEur(trip.totalEur - limit)} over the limit`;
  const url = safeBookingUrl(trip.bookingUrl);
  return h('li', { class: isDeal ? 'tile is-deal' : 'tile' },
    h(url ? 'a' : 'div', { href: url, target: url && '_blank', rel: url && 'noopener noreferrer', class: url ? null : 'tile-empty' },
      h('span', { class: 'tile-code' }, `${flagEmoji(dest.countryCode)} ${dest.iata}`),
      h('span', { class: 'tile-name' }, `${dest.name}, ${dest.country}`),
      h('span', { class: 'tile-fare' }, fmtEur(trip.totalEur)),
      h('span', { class: 'tile-gap' }, gap),
      h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: { '--fill': String(Math.min(1, limit / trip.totalEur)) } })),
    ),
  );
}

function renderRoutes(data) {
  const limit = data.rules.maxReturnPriceEur;
  $('routes-note').textContent = `Cheapest ${data.rules.minNights}–${data.rules.maxNights} night return per destination. The bar fills as a route nears ${fmtEur(limit)}.`;
  $('route-tiles').replaceChildren(...data.destinations.map((dest) => routeTile(dest, limit)));
}

function renderFailed(data) {
  const failed = data.failed ?? [];
  $('failed').hidden = failed.length === 0;
  $('failed').textContent = failed.length ? `Couldn’t check on the last run: ${failed.join(', ')}.` : '';
}

function render(data) {
  const deals = allDeals(data);
  const refreshDeals = () => { renderMonths(data, deals, refreshDeals); renderDeals(data, deals); };
  renderMasthead(data, deals);
  refreshDeals();
  renderRoutes(data);
  renderFailed(data);
}

function renderError(error) {
  $('deal-rows').replaceChildren(
    h('li', { class: 'row row-status' }, 'Couldn’t load the latest fares. ', h('strong', {}, 'Refresh in a moment.')),
  );
  console.error('Failed to load deals', error);
}

async function load() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch (error) {
    renderError(error);
  }
}

load();
