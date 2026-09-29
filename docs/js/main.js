// Entry point: loads the scanner's JSON and wires every view to one piece of state kept in the URL.

import { $, h } from './dom.js';
import { allDeals, filterDeals, groupByDestination, matchesQuery } from './data.js';
import { initRail, renderChrome } from './chrome.js';
import { initToolbar, renderCurrency, renderToolbar } from './filters.js';
import { renderInsights } from './insights.js';
import { renderMap } from './map.js';
import { renderOffer, renderRoutes } from './routes.js';
import { centerSelectedCard, initCarouselNav, renderShowcase } from './showcase.js';
import { CURRENCY_CODES, createMoney } from './format.js';

const DATA_URL = 'data/deals.json';
const HISTORY_URL = 'data/history.json';
const CURRENCY_KEY = 'zboruri:currency';
const DEFAULTS = { month: null, dest: null, query: '', sort: 'price', stay: 'any', airline: 'all', currency: 'EUR', allRoutes: false };
// URL parameter ↔ state field.
const PARAMS = { month: 'month', dest: 'dest', q: 'query', sort: 'sort', stay: 'stay', airline: 'airline', cur: 'currency' };

function storedCurrency() {
  try {
    return localStorage.getItem(CURRENCY_KEY);
  } catch {
    return null; // private mode or blocked storage: fall back to EUR
  }
}

function rememberCurrency(code) {
  try {
    localStorage.setItem(CURRENCY_KEY, code);
  } catch {
    // Storage is only a convenience; the URL still carries the choice.
  }
}

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const fromUrl = Object.fromEntries(Object.entries(PARAMS).map(([param, key]) => [key, params.get(param) ?? DEFAULTS[key]]));
  const currency = CURRENCY_CODES.includes(fromUrl.currency) && params.has('cur') ? fromUrl.currency : storedCurrency() ?? 'EUR';
  return { ...DEFAULTS, ...fromUrl, currency };
}

function writeUrlState(state) {
  const url = new URL(location.href);
  Object.entries(PARAMS).forEach(([param, key]) => {
    const value = typeof state[key] === 'string' ? state[key].trim() : state[key];
    if (value && value !== DEFAULTS[key]) url.searchParams.set(param, value);
    else url.searchParams.delete(param);
  });
  history.replaceState(null, '', url);
}

function createApp(data, history) {
  const deals = allDeals(data);
  let state = readUrlState();

  const render = () => {
    const money = createMoney(data.rates, state.currency);
    const matching = filterDeals(deals, state);
    const groups = groupByDestination(matching);
    const selected = groups.find(([first]) => first.dest.iata === state.dest) ?? groups[0] ?? null;
    const bestDeals = new Map(groups.map(([first]) => [first.dest.iata, first.trip]));

    renderChrome(data, deals, money);
    renderCurrency(data, money.code, (currency) => { rememberCurrency(currency); setState({ currency }); });
    renderToolbar({ data, deals: filterDeals(deals, { ...state, month: null }), allDeals: deals, state, setState });
    renderInsights({ data, deals: matching, money });
    renderShowcase({
      data, groups, selected, money, history,
      emptyMessage: state.query ? `No deals match “${state.query.trim()}” with these filters.` : 'No deals match these filters.',
      onSelect: (iata) => { setState({ dest: iata }); centerSelectedCard(); },
    });
    renderMap({
      data, bestDeals, selectedIata: selected?.[0].dest.iata ?? null, money,
      onSelect: (iata) => { setState({ dest: bestDeals.has(iata) ? iata : state.dest }); $('deals').scrollIntoView({ block: 'start' }); centerSelectedCard(); },
    });
    renderRoutes({
      data,
      destinations: data.destinations.filter((dest) => matchesQuery(dest, state.query)),
      expanded: state.allRoutes || Boolean(state.query.trim()),
      money,
      onExpand: () => setState({ allRoutes: true }),
    });
    renderOffer(deals, money);
  };

  function setState(patch) {
    state = { ...state, ...patch };
    writeUrlState(state);
    render();
  }

  initCarouselNav();
  initToolbar(setState);
  initRail();
  const search = $('search');
  search.value = state.query;
  search.addEventListener('input', () => setState({ query: search.value, dest: null }));
  render();
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function showError(error) {
  $('carousel').replaceChildren(h('div', { class: 'deal-empty' }, h('p', {}, 'Couldn’t load today’s fares. Refresh in a moment.')));
  $('status-updated').textContent = 'Offline';
  console.error('Failed to load deals', error);
}

async function load() {
  try {
    // Price history is optional: without it the detail panel simply shows "tracking since today".
    const [data, history] = await Promise.all([
      fetchJson(DATA_URL),
      fetchJson(HISTORY_URL).then((body) => body.destinations ?? {}).catch(() => ({})),
    ]);
    createApp(data, history);
  } catch (error) {
    showError(error);
  }
}

load();
