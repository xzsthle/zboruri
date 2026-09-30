// Price history: the cheapest return per day for one destination, as a small area chart.

import { h, icon, s } from './dom.js';
import { fmtShort } from './format.js';

const WIDTH = 320;
const HEIGHT = 110;
const PAD = 8;

function chart(points, money) {
  const values = points.map(([, price]) => price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => PAD + (i / (points.length - 1)) * (WIDTH - 2 * PAD);
  const y = (price) => PAD + (1 - (price - min) / span) * (HEIGHT - 2 * PAD);
  const coords = points.map(([, price], i) => [x(i), y(price)]);
  const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)} ${cy.toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1)[0].toFixed(1)} ${HEIGHT} L${coords[0][0].toFixed(1)} ${HEIGHT} Z`;
  const [lowX, lowY] = coords[values.indexOf(min)];

  // The SVG stretches to the card's width, so the low-point dot is an HTML element placed by percentage (it stays round).
  return h('div', { class: 'history-plot' },
    s('svg', { class: 'history-chart', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      s('path', { class: 'hc-area', d: area }),
      s('path', { class: 'hc-line', d: line, 'vector-effect': 'non-scaling-stroke' })),
    h('span', {
      class: 'history-low',
      title: `Lowest: ${money.format(min)}`,
      style: { '--x': `${((lowX / WIDTH) * 100).toFixed(2)}%`, '--y': `${((lowY / HEIGHT) * 100).toFixed(2)}%` },
    }));
}

function delta(first, last, money) {
  const change = Math.round(last - first);
  if (change === 0) return h('span', { class: 'history-delta' }, 'steady');
  const down = change < 0;
  return h('span', { class: down ? 'history-delta is-down' : 'history-delta is-up' },
    down && icon('i-trend-down'), `${down ? '−' : '+'}${money.format(Math.abs(change))}`);
}

export function priceHistory({ points, current, money }) {
  const days = points ?? [];
  const header = h('div', { class: 'panel-title' }, h('h4', {}, 'Price history'), h('span', {}, 'Cheapest return, per day'));
  if (days.length < 2) {
    return h('section', { class: 'history-card' }, header,
      h('p', {}, h('span', { class: 'history-value' }, money.format(current))),
      h('p', { class: 'history-note' },
        `Tracking since ${days[0] ? fmtShort(days[0][0]) : 'today'}. The chart fills in with every scan, twice a day.`));
  }
  const [firstDay, firstPrice] = days[0];
  const lastPrice = days.at(-1)[1];
  return h('section', { class: 'history-card' }, header,
    h('p', {}, h('span', { class: 'history-value' }, money.format(lastPrice)), delta(firstPrice, lastPrice, money)),
    chart(days, money),
    h('p', { class: 'history-note' }, `Since ${fmtShort(firstDay)} · low ${money.format(Math.min(...days.map(([, p]) => p)))}`));
}
