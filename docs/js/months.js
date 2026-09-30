// Cheapest-month pill bars, shared by Home and the results banner.

import { h } from './dom.js';
import { fmtMonthLong } from './format.js';

/**
 * One pill bar per month, height relative to the dearest month. Only the cheapest month
 * (the earliest one if several tie) shows its price; the rest show it on hover/focus.
 */
export function monthBars({ prices, money, selected = null, label, onPick }) {
  const entries = [...prices.entries()];
  if (!entries.length) return null;
  const values = entries.map(([, price]) => price);
  const max = Math.max(...values);
  const cheapest = Math.min(...values);
  const cheapestMonth = entries.find(([, price]) => price === cheapest)[0];

  return h('div', { class: 'months-chart', role: 'group', 'aria-label': label },
    entries.map(([month, price]) => {
      const [year, monthNumber] = month.split('-').map(Number);
      const name = fmtMonthLong(year, monthNumber - 1);
      const classes = ['mc-col', month === cheapestMonth && 'is-cheapest', month === selected && 'is-selected'].filter(Boolean).join(' ');
      return h('button', {
        type: 'button',
        class: classes,
        style: { '--fill': String(0.25 + 0.75 * (price / max)) },
        'aria-pressed': selected == null ? null : String(month === selected),
        onclick: () => onPick(month),
      },
        h('span', { class: 'mc-bar' }, h('span', { class: 'mc-price' }, money.format(price))),
        h('span', { class: 'mc-label' }, h('span', { 'aria-hidden': 'true' }, name.slice(0, 3)), h('span', { class: 'sr-only' }, name)));
    }));
}
