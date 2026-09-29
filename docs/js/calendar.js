// Fare calendar: the cheapest return starting on each day, as a month-by-month heatmap.

import { h } from './dom.js';
import { fmtDay, fmtMonthLong, parseDay } from './format.js';

const WEEKDAY_INITIALS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const pad = (n) => String(n).padStart(2, '0');

function level(price, limit) {
  if (price > limit) return 'is-over';
  const ratio = price / limit;
  if (ratio <= 0.6) return 'lvl-3';
  if (ratio <= 0.8) return 'lvl-2';
  return 'lvl-1';
}

/** [{ year, month }] from the first to the last month that has a price. */
function monthsBetween(firstIso, lastIso) {
  const first = parseDay(firstIso);
  const last = parseDay(lastIso);
  const count = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1;
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
  });
}

function dayCell(iso, day, price, { limit, money, selectedOut }) {
  const classes = ['cal-day', price == null ? '' : level(price, limit), iso === selectedOut ? 'is-selected' : ''].filter(Boolean);
  const title = price == null ? `${fmtDay(iso)} · no return trip` : `${fmtDay(iso)} · from ${money.format(price)} return`;
  return h('div', { class: classes.join(' '), title, 'aria-label': title },
    String(day), price != null && h('b', {}, money.amount(price)));
}

function monthGrid({ year, month }, prices, options) {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingBlanks = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday first
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const iso = `${year}-${pad(month + 1)}-${pad(i + 1)}`;
    return dayCell(iso, i + 1, prices.get(iso), options);
  });
  return h('div', { class: 'cal-month' },
    h('p', { class: 'cal-month-name' }, fmtMonthLong(year, month)),
    h('div', { class: 'cal-grid', role: 'grid' },
      WEEKDAY_INITIALS.map((d) => h('span', { class: 'cal-dow', 'aria-hidden': 'true' }, d)),
      Array.from({ length: leadingBlanks }, () => h('span', { class: 'cal-blank', 'aria-hidden': 'true' })),
      days));
}

const legendItem = (className, label) => h('span', {}, h('i', { class: `cal-day ${className}` }), label);

export function fareCalendar({ dest, limit, money, selectedOut }) {
  const entries = dest.calendar ?? [];
  if (entries.length === 0) return null;
  const prices = new Map(entries);
  const options = { limit, money, selectedOut };
  return h('section', { class: 'calendar-panel', 'aria-label': `Fare calendar for ${dest.name}` },
    h('div', { class: 'panel-title' }, h('h4', {}, 'Fare calendar'), h('span', {}, `Cheapest return by departure day · ${money.code}`)),
    h('div', { class: 'cal-months' }, monthsBetween(entries[0][0], entries.at(-1)[0]).map((m) => monthGrid(m, prices, options))),
    h('div', { class: 'cal-legend' },
      legendItem('lvl-3', 'Steal'), legendItem('lvl-2', 'Great'), legendItem('lvl-1', 'Under your limit'),
      legendItem('is-over', 'Above the limit'), legendItem('is-selected', 'Shown dates')));
}
