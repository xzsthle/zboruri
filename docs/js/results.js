// Results page: destination banner + cheapest months, sort tabs, a date strip, the filter sidebar and the list.

import { $, h, icon } from './dom.js';
import { destinationCard, resultCard } from './card.js';
import { renderFilterSidebar } from './sidebar.js';
import { colorBlock } from './art.js';
import { monthBars } from './months.js';
import { priceCalendar } from './pickers.js';
import { describeDepart, describeStay, describeTravellers } from './widget.js';
import { departSpec } from './query.js';
import { flightInfo } from './flight.js';
import { photoImg } from './photo.js';
import { fmtDuration } from './geo.js';
import { fmtShort, ORIGIN_NAMES, parseDay, plural } from './format.js';

const PAGE_SIZE = 12;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let visibleCount = PAGE_SIZE;
let lastKey = '';

const tripKey = (trip) => `${trip.iata}|${trip.outDate}|${trip.backDate}|${trip.airline}`;

function monthsTile({ engine, query, money, navigate }) {
  const prices = engine.pricesByMonth({ ...query, back: '' });
  if (prices.size < 2) return null;
  const spec = departSpec(query.depart);
  const selected = spec.month ?? spec.date?.slice(0, 7) ?? null;
  return h('div', { class: 'tile rh-months' },
    h('h2', { class: 'rh-months-title' }, 'Cheapest months'),
    monthBars({ prices, money, selected, label: 'Cheapest return by month', onPick: (month) => navigate({ ...query, depart: month, back: '' }) }));
}

/** One destination: a photo tile with the route and its facts. Several or everywhere: a title on the canvas. */
function banner({ site, engine, query, photos }, count) {
  const multi = query.to === 'anywhere' || query.to.includes(',');
  const origin = ORIGIN_NAMES[site.origin.iata] ?? site.origin.name;
  if (multi) {
    const where = query.label || (query.to === 'anywhere' ? 'everywhere' : `${query.to.split(',').length} destinations`);
    return h('div', { class: 'rh-plain' },
      h('h1', { class: 'rh-title' }, `${origin} → ${where}`),
      h('p', { class: 'rh-sub' }, [describeDepart(query.depart), describeStay(query), describeTravellers(query.adults), plural(count, 'destination')].join(' · ')));
  }
  const dest = engine.destinations.get(query.to);
  const info = dest && flightInfo({ iata: dest.iata, outDate: '2026-01-01', backDate: '2026-01-02' }, site, engine);
  const photo = photos[query.to];
  // Destinations only reachable with a connection get no distance-based flight time.
  const direct = dest?.direct !== false;
  const facts = info ? [direct ? 'Direct' : 'With a stop', direct && info.minutes && `≈ ${fmtDuration(info.minutes)}`, info.km && `${info.km.toLocaleString('en-US')} km`, dest.localCurrency && `pays in ${dest.localCurrency}`].filter(Boolean) : [];
  return h('div', { class: 'rh-banner photo-tile has-scrim' },
    photoImg(photo, { width: 1000, height: 400, sizes: '(max-width: 980px) 100vw, 850px', className: 'cover rh-img', eager: true, alt: dest?.name ?? query.to }) ?? colorBlock(query.to, 'cover'),
    dest && h('span', { class: 'tag-pill rh-country' }, dest.country),
    h('div', { class: 'rh-body' },
      h('h1', { class: 'rh-title' }, `${origin} → ${dest?.name ?? query.to}`),
      facts.length > 0 && h('p', { class: 'stat-pill rh-facts' }, facts.map((fact) => h('span', {}, fact)))));
}

function renderHead(ctx, count) {
  const { query } = ctx;
  $('ask-note').hidden = !query.note;
  $('ask-note').replaceChildren(h('span', { class: 'orb orb--sunk orb--sm', 'aria-hidden': 'true' }, icon('i-sparkles')), h('p', {}, query.note));
  $('results-head').replaceChildren(...[banner(ctx, count), monthsTile(ctx)].filter(Boolean));
  $('results-count').textContent = plural(count, query.to === 'anywhere' || query.to.includes(',') ? 'destination' : 'result');
}

function segment({ label, value, selected, onSelect }) {
  return h('button', { type: 'button', role: 'tab', class: 'sort-tab', 'aria-selected': String(selected), onclick: onSelect },
    h('span', { class: 'st-label' }, label), h('span', { class: 'st-value' }, value));
}

function sortTabs(ctx, tripsBySort) {
  const { filters, money, setFilters } = ctx;
  const describe = { best: (t) => money.format(t.pricePp), cheapest: (t) => money.format(t.pricePp), soonest: (t) => fmtShort(t.outDate) };
  const labels = { best: 'Best', cheapest: 'Cheapest', soonest: 'Soonest' };
  $('sort-tabs').replaceChildren(...Object.keys(labels).map((key) => {
    const top = tripsBySort[key][0];
    return segment({ label: labels[key], value: top ? describe[key](top) : '—', selected: filters.sort === key, onSelect: () => setFilters({ sort: key }) });
  }));
}

function stripDays(query, prices) {
  const spec = departSpec(query.depart);
  const sorted = [...prices.keys()].sort();
  if (spec.type === 'date') {
    const center = parseDay(spec.date).getTime();
    return Array.from({ length: 7 }, (_, i) => new Date(center + (i - 3) * 86_400_000).toISOString().slice(0, 10));
  }
  if (spec.type === 'month') return sorted.filter((date) => date.startsWith(spec.month));
  return sorted.slice(0, 21);
}

function stripButton(direction, strip) {
  const back = direction === 'prev';
  return h('button', {
    type: 'button', class: `orb orb--light strip-nav is-${direction}`, 'aria-label': back ? 'Earlier dates' : 'Later dates',
    onclick: () => strip.scrollBy({ left: (back ? -1 : 1) * strip.clientWidth * 0.8, behavior: 'smooth' }),
  }, icon(back ? 'i-chevron-left' : 'i-chevron-right'));
}

function dateStrip({ engine, query, money, navigate }) {
  const prices = engine.pricesByDepartDay({ ...query, back: '' });
  const days = stripDays(query, prices);
  const cheapest = Math.min(...days.map((d) => prices.get(d) ?? Infinity));
  const selected = departSpec(query.depart).date;
  const range = engine.dateRange();
  const strip = h('div', { class: 'strip', role: 'group', 'aria-label': 'Departure dates' }, days.map((date) => {
    const price = prices.get(date);
    const d = parseDay(date);
    return h('button', {
      type: 'button',
      class: ['strip-day', price === cheapest ? 'is-cheapest' : '', date === selected ? 'is-selected' : ''].filter(Boolean).join(' '),
      disabled: price == null,
      'aria-pressed': String(date === selected),
      onclick: () => navigate({ ...query, depart: date, back: '' }),
    }, h('span', { class: 'sd-day' }, `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`), h('span', { class: 'sd-price' }, price == null ? '—' : money.format(price)));
  }));
  $('date-strip').replaceChildren(
    h('div', { class: 'strip-wrap' }, stripButton('prev', strip), strip, stripButton('next', strip)),
    range && h('details', { class: 'calendar-toggle' },
      h('summary', { class: 'pill-orb pill-orb--canvas' }, 'Price calendar', h('span', { class: 'orb' }, icon('i-arrow'))),
      h('div', { class: 'tile calendar-panel' },
        priceCalendar({ prices, selected: selected ?? null, minDate: range.first, maxDate: range.last, money, onPick: (date) => navigate({ ...query, depart: date, back: '' }) }))));
  // Centre the selected (or cheapest) day, scrolling only the strip, never the page.
  const focus = strip.querySelector('.is-selected') ?? strip.querySelector('.is-cheapest');
  if (focus) strip.scrollLeft = focus.offsetLeft - (strip.clientWidth - focus.offsetWidth) / 2;
}

/** When only the budget rules everything out, say what the cheapest option actually costs. */
function budgetHint({ engine, query, filters }) {
  if (filters.maxPrice == null) return null;
  const open = { ...filters, maxPrice: null };
  const prices = query.to === 'anywhere' || query.to.includes(',')
    ? engine.explore(query, open).map((row) => row.best.pricePp)
    : engine.search(query, open).map((trip) => trip.pricePp);
  return prices.length ? Math.min(...prices) : null;
}

function emptyTile(iconId, title, text, actions) {
  return h('div', { class: 'tile empty' },
    h('span', { class: 'orb orb--sunk orb--lg', 'aria-hidden': 'true' }, icon(iconId)),
    h('h3', {}, title),
    h('p', {}, text),
    h('div', { class: 'empty-actions' }, actions));
}

function emptyState(ctx) {
  const { query, filters, money, navigate, setFilters } = ctx;
  const cheapest = budgetHint(ctx);
  if (cheapest != null) {
    return emptyTile('i-tag', `Nothing under ${money.format(filters.maxPrice)} for these dates`, `The cheapest option costs ${money.format(cheapest)} per person.`, [
      h('button', { type: 'button', class: 'btn-primary', onclick: () => setFilters({ maxPrice: null }) }, 'Show without the budget'),
      h('button', { type: 'button', class: 'btn-ghost is-sunk', onclick: () => navigate({ ...query, depart: 'anytime', back: '' }, filters) }, 'Keep the budget, any dates'),
    ]);
  }
  return emptyTile('i-search', 'No flights match', 'Try other dates, a longer stay, or fewer filters.', [
    h('button', { type: 'button', class: 'btn-ghost is-sunk', onclick: () => setFilters({ airlines: [], outWin: [], backWin: [], stops: [], maxPrice: null, weekend: false }) }, 'Clear filters'),
    h('button', { type: 'button', class: 'btn-primary', onclick: () => navigate({ ...query, depart: 'anytime', back: '' }) }, 'Search anytime'),
  ]);
}

function moreButton(total, rerender) {
  const left = total - visibleCount;
  return left > 0 ? h('button', { type: 'button', class: 'btn-ghost btn-more', onclick: () => { visibleCount += PAGE_SIZE; rerender(); } },
    `Show ${Math.min(PAGE_SIZE, left)} more`, h('span', {}, ` (${left} left)`)) : null;
}

// ---------- filters bottom sheet (≤980px) ----------

function setSheet(open) {
  $('filters').classList.toggle('is-open', open);
  $('filters-backdrop').hidden = !open;
  $('filters-open').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('has-sheet', open);
  if (open) $('filters').querySelector('button, input')?.focus();
  else $('filters-open').focus();
}

const sheetOpen = () => $('filters').classList.contains('is-open');
let sheetWired = false;

function wireFilterSheet(activeFilters) {
  if (!sheetWired) {
    sheetWired = true;
    // The sidebar re-renders on every filter change, so listen on the document rather than inside it.
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && sheetOpen()) setSheet(false); });
    window.matchMedia('(min-width: 981px)').addEventListener('change', (event) => { if (event.matches && sheetOpen()) setSheet(false); });
  }
  $('filters-open').onclick = () => setSheet(!sheetOpen());
  $('filters-backdrop').onclick = () => setSheet(false);
  $('filters-open').querySelector('span').textContent = activeFilters > 0 ? `Filters · ${activeFilters}` : 'Filters';
}

function renderFlights(ctx, rerender) {
  const { engine, query, filters, site, money, openTrip } = ctx;
  const bySort = Object.fromEntries(['best', 'cheapest', 'soonest'].map((sort) => [sort, engine.search(query, { ...filters, sort })]));
  const trips = bySort[filters.sort];
  const tops = Object.fromEntries(Object.entries(bySort).map(([sort, list]) => [sort, list[0] && tripKey(list[0])]));
  renderHead(ctx, trips.length);
  sortTabs(ctx, bySort);
  dateStrip(ctx);
  $('result-list').replaceChildren(...(trips.length === 0 ? [emptyState(ctx)] : trips.slice(0, visibleCount).map((trip) => resultCard({
    trip, info: flightInfo(trip, site, engine), money, adults: query.adults,
    badges: Object.keys(tops).filter((sort) => tops[sort] === tripKey(trip)),
    onSelect: () => openTrip(trip),
  }))));
  $('results-more').replaceChildren(...[moreButton(trips.length, rerender)].filter(Boolean));
  return renderFilterSidebar({ ...ctx, closeSheet: () => setSheet(false) }, engine.tripsFor(query.to, query));
}

function renderEverywhere(ctx, rerender) {
  const { engine, query, filters, site, money, navigate } = ctx;
  const rows = engine.explore(query, filters);
  const ordered = filters.sort === 'soonest' ? rows.toSorted((a, b) => a.best.outDate.localeCompare(b.best.outDate)) : rows;
  renderHead(ctx, rows.length);
  $('sort-tabs').replaceChildren(...[['best', 'Cheapest'], ['soonest', 'Soonest']].map(([key, label]) => segment({
    label,
    value: rows.length ? (key === 'soonest' ? fmtShort(ordered[0].best.outDate) : money.format(rows[0].best.pricePp)) : '—',
    selected: (filters.sort === 'soonest') === (key === 'soonest'),
    onSelect: () => ctx.setFilters({ sort: key }),
  })));
  $('date-strip').replaceChildren();
  $('result-list').replaceChildren(...(ordered.length === 0 ? [emptyState(ctx)] : [h('div', { class: 'dest-grid' }, ordered.slice(0, visibleCount).map((row) => destinationCard({
    ...row, money, photo: ctx.photos[row.dest.iata], info: flightInfo(row.best, site, engine),
    onSelect: () => navigate({ ...query, to: row.dest.iata }),
  })))]));
  $('results-more').replaceChildren(...[moreButton(ordered.length, rerender)].filter(Boolean));
  const scope = query.to === 'anywhere' ? [...engine.destinations.keys()] : query.to.split(',');
  return renderFilterSidebar({ ...ctx, closeSheet: () => setSheet(false) }, scope.flatMap((iata) => engine.tripsFor(iata, query)));
}

export function renderResults(ctx) {
  const key = JSON.stringify([ctx.query, ctx.filters, ctx.money.code]);
  if (key !== lastKey) {
    visibleCount = PAGE_SIZE;
    lastKey = key;
  }
  const rerender = () => renderResults(ctx);
  const activeFilters = ctx.query.to === 'anywhere' || ctx.query.to.includes(',') ? renderEverywhere(ctx, rerender) : renderFlights(ctx, rerender);
  wireFilterSheet(activeFilters);
}
