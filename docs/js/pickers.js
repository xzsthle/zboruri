// Search-widget popover panels: a two-month price calendar, month chips, trip length and travellers.

import { h, icon } from './dom.js';
import { fmtDay, fmtMonthLong, parseDay } from './format.js';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const pad = (n) => String(n).padStart(2, '0');
const monthKey = (year, month) => `${year}-${pad(month + 1)}`;

/** Price tiers relative to what's on offer: tier-1 is the cheapest third. */
function tierOf(price, sorted) {
  if (price == null || sorted.length === 0) return '';
  const rank = sorted.findIndex((p) => p >= price) / sorted.length;
  return rank < 1 / 3 ? 'tier-1' : rank < 2 / 3 ? 'tier-2' : 'tier-3';
}

function monthsBetween(firstIso, lastIso) {
  const first = parseDay(firstIso);
  const last = parseDay(lastIso);
  const count = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1;
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
}

function monthView({ year, month }, { prices, sorted, selected, rangeStart, minDate, maxDate, money, onPick }) {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const blanks = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: days }, (_, i) => {
    const iso = `${year}-${pad(month + 1)}-${pad(i + 1)}`;
    const price = prices.get(iso);
    const disabled = price == null || iso < minDate || iso > maxDate;
    const inRange = rangeStart && selected && iso > rangeStart && iso < selected;
    const classes = ['pc-day', disabled ? '' : tierOf(price, sorted), iso === selected ? 'is-selected' : '', iso === rangeStart ? 'is-start' : '', inRange ? 'in-range' : ''];
    return h('button', {
      type: 'button',
      class: classes.filter(Boolean).join(' '),
      disabled,
      'aria-pressed': String(iso === selected),
      'aria-label': disabled ? `${fmtDay(iso)}, no flights` : `${fmtDay(iso)}, from ${money.format(price)}`,
      onclick: () => onPick(iso),
    }, h('span', { class: 'pc-num' }, String(i + 1)), !disabled && h('span', { class: 'pc-price' }, money.amount(price)));
  });
  return h('div', { class: 'pc-month' },
    h('p', { class: 'pc-title' }, fmtMonthLong(year, month)),
    h('div', { class: 'pc-grid' },
      WEEKDAYS.map((d) => h('span', { class: 'pc-dow', 'aria-hidden': 'true' }, d)),
      Array.from({ length: blanks }, () => h('span', { 'aria-hidden': 'true' })),
      cells));
}

/**
 * Two months side by side with prev/next. `prices` is Map(date → price per person).
 * Days without a price, or outside [minDate, maxDate], are disabled.
 */
export function priceCalendar({ prices, selected, rangeStart = null, minDate, maxDate, money, onPick }) {
  const months = monthsBetween(minDate, maxDate);
  const firstPriced = [...prices.keys()].sort()[0];
  const focus = selected ?? rangeStart ?? firstPriced ?? minDate;
  const focusIndex = Math.max(0, months.findIndex((m) => monthKey(m.year, m.month) === focus.slice(0, 7)));
  // When the first flights are in the last days of a month, open on the next month instead.
  const tailOfMonth = !selected && !rangeStart && focus === firstPriced && Number(focus.slice(8)) > 25;
  const startIndex = tailOfMonth ? Math.min(focusIndex + 1, months.length - 1) : focusIndex;
  const sorted = [...prices.values()].sort((a, b) => a - b);
  const root = h('div', { class: 'pc' });
  const options = { prices, sorted, selected, rangeStart, minDate, maxDate, money, onPick };

  const render = (index) => {
    const visible = months.slice(index, index + 2);
    root.replaceChildren(
      h('div', { class: 'pc-nav' },
        h('button', { type: 'button', class: 'pc-arrow', disabled: index === 0, 'aria-label': 'Previous month', onclick: () => render(index - 1) }, icon('i-chevron-left')),
        h('button', { type: 'button', class: 'pc-arrow', disabled: index + 2 >= months.length, 'aria-label': 'Next month', onclick: () => render(index + 1) }, icon('i-chevron-right'))),
      h('div', { class: 'pc-months' }, visible.map((m) => monthView(m, options))),
      h('div', { class: 'pc-legend' },
        h('span', {}, h('i', { class: 'pc-swatch tier-1' }), 'Cheapest'),
        h('span', {}, h('i', { class: 'pc-swatch tier-2' }), 'Average'),
        h('span', {}, h('i', { class: 'pc-swatch tier-3' }), 'Higher'),
        h('span', { class: 'pc-note' }, `Return price per person · ${money.code}`)));
  };
  render(Math.min(startIndex, Math.max(0, months.length - 2)));
  return root;
}

/** "Whole month" chips with the cheapest return in each month. */
export function monthChips({ prices, selected, money, onPick }) {
  const year = new Date().getUTCFullYear();
  return h('div', { class: 'month-chips' }, [...prices.entries()].map(([month, price]) => {
    const [y, m] = month.split('-').map(Number);
    return h('button', { type: 'button', class: 'month-chip', 'aria-pressed': String(month === selected), onclick: () => onPick(month) },
      h('strong', {}, fmtMonthLong(y, m - 1).replace(` ${year}`, '')),
      h('span', {}, `from ${money.format(price)}`));
  }));
}

export function tabs(items, active, onChange) {
  return h('div', { class: 'pop-tabs', role: 'tablist' }, items.map(([key, label, disabled]) =>
    h('button', { type: 'button', role: 'tab', class: 'pop-tab', disabled: Boolean(disabled), 'aria-selected': String(key === active), onclick: () => onChange(key) }, label)));
}

export function stepper({ label, hint, value, min, max, onChange }) {
  return h('div', { class: 'stepper' },
    h('div', {}, h('p', { class: 'stepper-label' }, label), hint && h('p', { class: 'stepper-hint' }, hint)),
    h('div', { class: 'stepper-controls' },
      h('button', { type: 'button', class: 'stepper-btn', disabled: value <= min, 'aria-label': `Fewer ${label.toLowerCase()}`, onclick: () => onChange(value - 1) }, '−'),
      h('output', { class: 'stepper-value', 'aria-live': 'polite' }, String(value)),
      h('button', { type: 'button', class: 'stepper-btn', disabled: value >= max, 'aria-label': `More ${label.toLowerCase()}`, onclick: () => onChange(value + 1) }, '+')));
}

export const STAY_PRESETS = [
  ['Weekend', 2, 3],
  ['3–5 nights', 3, 5],
  ['About a week', 6, 8],
  ['Any length', null, null],
];

export function stayPresets({ min, max, limits, onPick }) {
  return h('div', { class: 'preset-chips' }, STAY_PRESETS.map(([label, from, to]) => {
    const lo = Math.max(limits.min, from ?? limits.min);
    const hi = Math.min(limits.max, to ?? limits.max);
    return h('button', { type: 'button', class: 'preset-chip', 'aria-pressed': String(lo === min && hi === max), onclick: () => onPick(lo, hi) }, label);
  }));
}
