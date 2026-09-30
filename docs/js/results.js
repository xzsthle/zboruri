// Results page: header with a cheapest-month chart, sort tabs, a date strip, the filter sidebar and the list.

import { $, h, icon } from './dom.js';
import { destinationCard, resultCard } from './card.js';
import { renderFilterSidebar } from './sidebar.js';
import { priceCalendar } from './pickers.js';
import { describeDepart, describeStay, describeTravellers } from './widget.js';
import { departSpec } from './query.js';
import { flightInfo } from './flight.js';
import { photoCredit, photoImg } from './photo.js';
import { fmtDuration } from './geo.js';
import { flagEmoji, fmtShort, ORIGIN_NAMES, parseDay, plural } from './format.js';

const PAGE_SIZE = 12;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let visibleCount = PAGE_SIZE;
let lastKey = '';

const tripKey = (trip) => `${trip.iata}|${trip.outDate}|${trip.backDate}|${trip.airline}`;

function monthBars({ engine, query, money, navigate }) {
  const prices = engine.pricesByMonth({ ...query, back: '' });
  if (prices.size < 2) return null;
  const values = [...prices.values()];
  const max = Math.max(...values);
  const cheapest = Math.min(...values);
  const active = departSpec(query.depart).month ?? query.depart.slice(0, 7);
  return h('div', { class: 'month-bars', role: 'group', 'aria-label': 'Cheapest return by month' },
    [...prices.entries()].map(([month, price]) => h('button', {
      type: 'button',
      class: ['month-bar', price === cheapest ? 'is-cheapest' : '', month === active ? 'is-active' : ''].filter(Boolean).join(' '),
      style: { '--fill': String(0.25 + 0.75 * (price / max)) },
      title: `${MONTHS[Number(month.slice(5)) - 1]}: from ${money.format(price)}`,
      onclick: () => navigate({ ...query, depart: month, back: '' }),
    }, h('span', { class: 'mb-price' }, money.format(price)), h('span', { class: 'mb-bar', 'aria-hidden': 'true' }), h('span', { class: 'mb-label' }, MONTHS[Number(month.slice(5)) - 1]))));
}

function renderHead({ site, engine, query, money, navigate, photos }, count) {
  const anywhere = query.to === 'anywhere';
  const several = query.to.includes(',');
  const dest = engine.destinations.get(query.to);
  const origin = ORIGIN_NAMES[site.origin.iata] ?? site.origin.name;
  const info = dest && flightInfo({ iata: dest.iata, outDate: '2026-01-01', backDate: '2026-01-02' }, site, engine);
  const photo = !anywhere && photos[query.to];
  const banner = photo && photoImg(photo, { width: 1200, height: 420, className: 'rh-img', eager: true, alt: `${dest?.name ?? query.to}` });
  $('ask-note').hidden = !query.note;
  $('ask-note').replaceChildren(icon('i-sparkles'), h('p', {}, query.note));
  $('results-head').replaceChildren(
    h('div', { class: banner ? 'rh-text has-photo' : 'rh-text' },
      banner,
      banner && photoCredit(photo),
      h('p', { class: 'eyebrow' }, anywhere || several ? 'Explore' : 'Flights'),
      h('h1', { class: 'rh-title' }, anywhere || several
        ? (query.label ? `${origin} → ${query.label}` : `${origin} to ${several ? `${query.to.split(',').length} destinations` : 'everywhere'}`)
        : [`${origin} to ${dest?.name ?? query.to} `, h('span', { class: 'rh-flag', 'aria-hidden': 'true' }, flagEmoji(dest?.countryCode))]),
      h('p', { class: 'rh-sub' }, [describeDepart(query.depart), describeStay(query), describeTravellers(query.adults), plural(count, anywhere ? 'destination' : 'result')].join(' · ')),
      !anywhere && info && h('ul', { class: 'rh-facts' },
        h('li', {}, icon('i-plane'), 'Direct flights'),
        info.minutes && h('li', {}, icon('i-clock'), `≈ ${fmtDuration(info.minutes)} each way`),
        info.km && h('li', {}, icon('i-map'), `${info.km.toLocaleString('en-US')} km`),
        dest.localCurrency && h('li', {}, icon('i-tag'), `Pay locally in ${dest.localCurrency}`))),
    monthBars({ engine, query, money, navigate }),
    h('button', { type: 'button', class: 'btn-ghost filters-toggle', onclick: () => $('filters').classList.toggle('is-open') }, icon('i-sort'), 'Filters'));
}

function sortTabs(ctx, tripsBySort) {
  const { filters, money, setFilters } = ctx;
  const describe = {
    best: (t) => `${money.format(t.pricePp)} · ${plural(t.nights, 'night')}`,
    cheapest: (t) => money.format(t.pricePp),
    soonest: (t) => `${fmtShort(t.outDate)} · ${money.format(t.pricePp)}`,
  };
  const labels = { best: 'Best', cheapest: 'Cheapest', soonest: 'Soonest' };
  $('sort-tabs').replaceChildren(...Object.keys(labels).map((key) => {
    const top = tripsBySort[key][0];
    return h('button', { type: 'button', role: 'tab', class: 'sort-tab', 'aria-selected': String(filters.sort === key), onclick: () => setFilters({ sort: key }) },
      h('span', { class: 'st-label' }, labels[key]), h('span', { class: 'st-value' }, top ? describe[key](top) : '—'));
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

function dateStrip({ engine, query, money, navigate }) {
  const prices = engine.pricesByDepartDay({ ...query, back: '' });
  const days = stripDays(query, prices);
  const cheapest = Math.min(...days.map((d) => prices.get(d) ?? Infinity));
  const selected = departSpec(query.depart).date;
  const range = engine.dateRange();
  $('date-strip').replaceChildren(
    h('div', { class: 'strip', role: 'group', 'aria-label': 'Departure dates' }, days.map((date) => {
      const price = prices.get(date);
      const d = parseDay(date);
      return h('button', {
        type: 'button',
        class: ['strip-day', price === cheapest ? 'is-cheapest' : '', date === selected ? 'is-selected' : ''].filter(Boolean).join(' '),
        disabled: price == null,
        'aria-pressed': String(date === selected),
        onclick: () => navigate({ ...query, depart: date, back: '' }),
      }, h('span', { class: 'sd-day' }, `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`), h('span', { class: 'sd-price' }, price == null ? '—' : money.format(price)));
    })),
    range && h('details', { class: 'calendar-toggle' },
      h('summary', {}, icon('i-calendar'), 'Price calendar'),
      priceCalendar({ prices, selected: selected ?? null, minDate: range.first, maxDate: range.last, money, onPick: (date) => navigate({ ...query, depart: date, back: '' }) })));
}

/** When only the budget rules everything out, say what the cheapest option actually costs. */
function budgetHint({ engine, query, filters, money }) {
  if (filters.maxPrice == null) return null;
  const open = { ...filters, maxPrice: null };
  const prices = query.to === 'anywhere' || query.to.includes(',')
    ? engine.explore(query, open).map((row) => row.best.pricePp)
    : engine.search(query, open).map((trip) => trip.pricePp);
  return prices.length ? Math.min(...prices) : null;
}

function emptyState(ctx) {
  const { query, filters, money, navigate, setFilters } = ctx;
  const cheapest = budgetHint(ctx);
  if (cheapest != null) {
    return h('div', { class: 'empty' },
      icon('i-tag', 'icon empty-icon'),
      h('h3', {}, `Nothing under ${money.format(filters.maxPrice)} for these dates`),
      h('p', {}, `The cheapest option costs ${money.format(cheapest)} per person.`),
      h('div', { class: 'empty-actions' },
        h('button', { type: 'button', class: 'btn-primary', onclick: () => setFilters({ maxPrice: null }) }, `Show without the budget`),
        h('button', { type: 'button', class: 'btn-ghost', onclick: () => navigate({ ...query, depart: 'anytime', back: '' }, filters) }, 'Keep the budget, any dates')));
  }
  return h('div', { class: 'empty' },
    icon('i-search', 'icon empty-icon'),
    h('h3', {}, 'No flights match'),
    h('p', {}, 'Try other dates, a longer stay, or fewer filters.'),
    h('div', { class: 'empty-actions' },
      h('button', { type: 'button', class: 'btn-ghost', onclick: () => setFilters({ airlines: [], outWin: [], backWin: [], maxPrice: null, weekend: false }) }, 'Clear filters'),
      h('button', { type: 'button', class: 'btn-primary', onclick: () => navigate({ ...query, depart: 'anytime', back: '' }) }, 'Search anytime')));
}

function moreButton(total, rerender) {
  const left = total - visibleCount;
  return left > 0 ? h('button', { type: 'button', class: 'btn-ghost btn-more', onclick: () => { visibleCount += PAGE_SIZE; rerender(); } },
    `Show ${Math.min(PAGE_SIZE, left)} more`, h('span', {}, ` (${left} left)`)) : null;
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
  renderFilterSidebar(ctx, engine.tripsFor(query.to, query));
}

function renderEverywhere(ctx, rerender) {
  const { engine, query, filters, site, money, navigate } = ctx;
  const rows = engine.explore(query, filters);
  const ordered = filters.sort === 'soonest' ? rows.toSorted((a, b) => a.best.outDate.localeCompare(b.best.outDate)) : rows;
  renderHead(ctx, rows.length);
  $('sort-tabs').replaceChildren(...[['best', 'Cheapest'], ['soonest', 'Soonest']].map(([key, label]) =>
    h('button', { type: 'button', role: 'tab', class: 'sort-tab', 'aria-selected': String((filters.sort === 'soonest') === (key === 'soonest')), onclick: () => ctx.setFilters({ sort: key }) },
      h('span', { class: 'st-label' }, label), h('span', { class: 'st-value' }, rows.length ? (key === 'soonest' ? fmtShort(ordered[0].best.outDate) : money.format(rows[0].best.pricePp)) : '—'))));
  $('date-strip').replaceChildren();
  $('result-list').replaceChildren(...(ordered.length === 0 ? [emptyState(ctx)] : [h('div', { class: 'dest-grid' }, ordered.slice(0, visibleCount).map((row) => destinationCard({
    ...row, money, photo: ctx.photos[row.dest.iata], info: flightInfo(row.best, site, engine),
    onSelect: () => navigate({ ...query, to: row.dest.iata }),
  })))]));
  $('results-more').replaceChildren(...[moreButton(ordered.length, rerender)].filter(Boolean));
  const scope = query.to === 'anywhere' ? [...engine.destinations.keys()] : query.to.split(',');
  renderFilterSidebar(ctx, scope.flatMap((iata) => engine.tripsFor(iata, query)));
}

export function renderResults(ctx) {
  const key = JSON.stringify([ctx.query, ctx.filters, ctx.money.code]);
  if (key !== lastKey) {
    visibleCount = PAGE_SIZE;
    lastKey = key;
  }
  const rerender = () => renderResults(ctx);
  if (ctx.query.to === 'anywhere' || ctx.query.to.includes(',')) renderEverywhere(ctx, rerender);
  else renderFlights(ctx, rerender);
}
