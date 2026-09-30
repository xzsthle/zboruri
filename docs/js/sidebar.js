// Results filter sidebar: stops, departure times (each direction), airlines, max price, weekend trips.

import { $, h } from './dom.js';
import { TIME_WINDOWS, windowOf } from './engine.js';

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function group(title, ...children) {
  return h('section', { class: 'fg' }, h('h3', { class: 'fg-title' }, title), ...children);
}

function checkRow({ label, hint, count, checked, disabled, onChange }) {
  return h('label', { class: disabled ? 'check is-disabled' : 'check' },
    h('input', { type: 'checkbox', checked, disabled, onchange: onChange }),
    h('span', { class: 'check-box', 'aria-hidden': 'true' }),
    h('span', { class: 'check-text' }, h('span', {}, label), hint && h('small', {}, hint)),
    count != null && h('span', { class: 'check-count' }, count));
}

function timeGroup(title, field, trips, timeOf, { filters, setFilters }) {
  const counts = new Map();
  trips.forEach((trip) => {
    const w = windowOf(timeOf(trip));
    if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
  });
  return h('div', { class: 'fg-sub' }, h('p', { class: 'fg-subtitle' }, title), Object.entries(TIME_WINDOWS).map(([key, w]) => checkRow({
    label: w.label,
    hint: w.range,
    count: counts.get(key) ?? 0,
    checked: filters[field].includes(key),
    disabled: !counts.get(key) && !filters[field].includes(key),
    onChange: () => setFilters({ [field]: toggle(filters[field], key) }),
  })));
}

function airlineGroup(trips, { filters, setFilters, money }) {
  const cheapest = new Map();
  trips.forEach((trip) => cheapest.set(trip.airline, Math.min(cheapest.get(trip.airline) ?? Infinity, trip.pricePp)));
  const names = [...cheapest.keys()].sort();
  return group('Airlines', ...names.map((name) => checkRow({
    label: name,
    count: `from ${money.format(cheapest.get(name))}`,
    checked: filters.airlines.includes(name),
    onChange: () => setFilters({ airlines: toggle(filters.airlines, name) }),
  })));
}

function priceGroup(trips, { filters, setFilters, money }) {
  if (trips.length === 0) return null;
  const prices = trips.map((trip) => trip.pricePp);
  const min = Math.floor(Math.min(...prices));
  const max = Math.ceil(Math.max(...prices));
  const value = filters.maxPrice == null ? max : Math.min(max, Math.max(min, filters.maxPrice));
  // Show the budget as set, even when it's below every price on offer.
  const label = h('output', { class: 'range-value' }, filters.maxPrice == null ? 'Any price' : `Up to ${money.format(filters.maxPrice)}`);
  const input = h('input', {
    type: 'range', class: 'range', min: String(min), max: String(max), step: '1', value: String(value),
    'aria-label': 'Maximum price per person',
    oninput: (event) => { label.textContent = `Up to ${money.format(Number(event.target.value))}`; },
    onchange: (event) => setFilters({ maxPrice: Number(event.target.value) >= max ? null : Number(event.target.value) }),
  });
  return group('Price per person', label, input, h('div', { class: 'range-ends' }, h('span', {}, money.format(min)), h('span', {}, money.format(max))));
}

const activeCount = (filters) =>
  filters.airlines.length + filters.outWin.length + filters.backWin.length + (filters.maxPrice != null ? 1 : 0) + (filters.weekend ? 1 : 0);

/** `trips` are all trips for the current search before filters, so counts show what each filter would give. */
export function renderFilterSidebar(ctx, trips) {
  const { filters, setFilters } = ctx;
  const active = activeCount(filters);
  $('filters').replaceChildren(
    h('div', { class: 'filters-head' },
      h('h2', {}, 'Filters'),
      active > 0 && h('button', { type: 'button', class: 'link-btn', onclick: () => setFilters({ airlines: [], outWin: [], backWin: [], maxPrice: null, weekend: false }) }, `Clear all (${active})`)),
    group('Stops', checkRow({ label: 'Direct', hint: 'Every flight shown is non-stop', checked: true, disabled: true, onChange: () => {} })),
    group('Trip type', checkRow({
      label: 'Weekend trips only', hint: 'Leave Thu–Sat, back Sun or Mon', checked: filters.weekend,
      onChange: () => setFilters({ weekend: !filters.weekend }),
    })),
    group('Departure times',
      timeGroup('Outbound', 'outWin', trips, (trip) => trip.outTime, ctx),
      timeGroup('Return', 'backWin', trips, (trip) => trip.backTime, ctx)),
    priceGroup(trips, ctx),
    airlineGroup(trips, ctx));
}
