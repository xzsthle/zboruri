// The filter toolbar (month, trip length, airline, sort) and the currency switch.

import { $, h, icon } from './dom.js';
import { airlinesOf, monthCounts, STAYS } from './data.js';
import { CURRENCY_CODES, fmtMonth } from './format.js';

function renderMonths(data, deals, active, onChange) {
  const year = new Date(data.generatedAt).getUTCFullYear();
  const tabs = [[null, 'All months', deals.length], ...monthCounts(deals).map(([month, count]) => [month, fmtMonth(month, year), count])];
  $('months').replaceChildren(...tabs.map(([month, label, count]) =>
    h('button', { class: 'tab', type: 'button', 'aria-pressed': String(month === active), onclick: () => onChange(month) },
      label, h('span', { class: 'tab-count' }, String(count)))));
}

function renderStays(active, onChange) {
  $('stay').replaceChildren(...Object.entries(STAYS).map(([key, { label, icon: iconId }]) =>
    h('button', { class: 'chip', type: 'button', 'aria-pressed': String(key === active), onclick: () => onChange(key) },
      iconId && icon(iconId), label)));
}

function renderAirlines(deals, active) {
  const airlines = airlinesOf(deals);
  const select = $('airline');
  select.replaceChildren(
    h('option', { value: 'all' }, `All airlines (${airlines.length})`),
    ...airlines.map((name) => h('option', { value: name }, name)),
  );
  select.value = airlines.includes(active) ? active : 'all';
}

/**
 * `deals` are the deals matching every filter except month, so the month tabs show useful counts;
 * `allDeals` feeds the airline list so an airline never disappears from its own filter.
 */
export function renderToolbar({ data, deals, allDeals, state, setState }) {
  renderMonths(data, deals, state.month, (month) => setState({ month, dest: null }));
  renderStays(state.stay, (stay) => setState({ stay, dest: null }));
  renderAirlines(allDeals, state.airline);
  $('sort').value = state.sort;
}

export function initToolbar(setState) {
  $('airline').addEventListener('change', (event) => setState({ airline: event.target.value, dest: null }));
  $('sort').addEventListener('change', (event) => setState({ sort: event.target.value, dest: null }));
}

export function renderCurrency(data, active, onChange) {
  const codes = CURRENCY_CODES.filter((code) => code === 'EUR' || Number.isFinite(data.rates?.[code]));
  $('currency').replaceChildren(...codes.map((code) =>
    h('button', { type: 'button', 'aria-pressed': String(code === active), onclick: () => onChange(code) }, code)));
}
