// Price history: the cheapest return per day for one destination, as a small area chart.

import { h, icon, s } from './dom.js';
import { fmtShort } from './format.js';

const WIDTH = 320;
const HEIGHT = 110;
const PAD = 8;

function chart(points) {
  const values = points.map(([, price]) => price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => PAD + (i / (points.length - 1)) * (WIDTH - 2 * PAD);
  const y = (price) => PAD + (1 - (price - min) / span) * (HEIGHT - 2 * PAD);
  const coords = points.map(([, price], i) => [x(i), y(price)]);
  const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)} ${cy.toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1)[0].toFixed(1)} ${HEIGHT} L${coords[0][0].toFixed(1)} ${HEIGHT} Z`;
  const [lastX, lastY] = coords.at(-1);

  return s('svg', { class: 'history-chart', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    s('defs', {},
      s('linearGradient', { id: 'history-fill', x1: '0', y1: '0', x2: '0', y2: '1' },
        s('stop', { offset: '0', 'stop-color': '#4a64ff', 'stop-opacity': '0.35' }),
        s('stop', { offset: '1', 'stop-color': '#4a64ff', 'stop-opacity': '0' }))),
    s('path', { d: area, fill: 'url(#history-fill)' }),
    s('path', { d: line, fill: 'none', stroke: '#1f2e86', 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }),
    s('circle', { cx: lastX.toFixed(1), cy: lastY.toFixed(1), r: '4.5', fill: '#ff3d7f', stroke: '#fff', 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' }));
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
        `Tracking since ${days[0] ? fmtShort(days[0][0]) : 'today'} — the chart fills in with every scan, twice a day.`));
  }
  const [firstDay, firstPrice] = days[0];
  const lastPrice = days.at(-1)[1];
  return h('section', { class: 'history-card' }, header,
    h('p', {}, h('span', { class: 'history-value' }, money.format(lastPrice)), delta(firstPrice, lastPrice, money)),
    chart(days),
    h('p', { class: 'history-note' }, `Since ${fmtShort(firstDay)} · low ${money.format(Math.min(...days.map(([, p]) => p)))}`));
}
