// Entry point: loads the scanner's data, builds the search engine, and routes between Home and Results.

import { $, h } from './dom.js';
import { createEngine } from './engine.js';
import { initDetails, openDetails } from './details.js';
import { renderHome } from './home.js';
import { renderResults } from './results.js';
import { createSearchWidget } from './widget.js';
import { initAsk } from './ask.js';
import { DEFAULT_FILTERS, parseHash, toHash } from './query.js';
import { CURRENCY_CODES, createMoney, fmtNextScan } from './format.js';

const CURRENCY_KEY = 'zboruri:currency';

function readCurrency() {
  try {
    return localStorage.getItem(CURRENCY_KEY) ?? 'EUR';
  } catch {
    return 'EUR'; // private mode or blocked storage
  }
}

function saveCurrency(code) {
  try {
    localStorage.setItem(CURRENCY_KEY, code);
  } catch {
    // Only a convenience; the page still works in euros.
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function start({ site, fares, priceHistory, photos }) {
  const engine = createEngine(site, fares);
  let currency = CURRENCY_CODES.includes(readCurrency()) ? readCurrency() : 'EUR';
  let route = parseHash(location.hash, site.rules);
  const money = () => createMoney(site.rates, currency);

  const navigate = (query, filters = {}) => { location.hash = toHash(query, { ...DEFAULT_FILTERS, ...filters }); };
  const setFilters = (patch) => {
    route = { ...route, filters: { ...route.filters, ...patch } };
    window.history.replaceState(null, '', toHash(route.query, route.filters));
    render();
  };

  const widget = createSearchWidget({ site, engine, photos, getMoney: money, onSearch: (query, filters) => navigate(query, filters) });

  function context() {
    return {
      site, engine, photos, history: priceHistory, query: route.query, filters: route.filters, money: money(), navigate, setFilters,
      openTrip: (trip) => openDetails({
        trip, site, engine, photos, money: money(), query: route.query, history: priceHistory,
        onChangeDate: (iata, date) => navigate({ ...route.query, to: iata, depart: date, back: '' }),
      }),
    };
  }

  // The nav pill for where the viewer is: Everywhere, Weekend deals, or Flights for everything else.
  function markNav() {
    const { view, query, filters } = route;
    const everywhere = view === 'search' && query.to === 'anywhere';
    const current = everywhere ? (filters.weekend ? 'weekend' : 'explore') : 'flights';
    document.querySelectorAll('[data-nav-item]').forEach((link) => {
      if (link.dataset.navItem === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function render() {
    const isSearch = route.view === 'search';
    document.body.dataset.view = route.view;
    $('view-home').hidden = isSearch;
    $('view-search').hidden = !isSearch;
    widget.setQuery(route.query, route.filters);
    $('currency').value = currency;
    markNav();
    if (isSearch) renderResults(context());
    else renderHome(context());
  }

  window.addEventListener('hashchange', () => {
    route = parseHash(location.hash, site.rules);
    render();
    window.scrollTo({ top: 0 });
  });
  $('currency').replaceChildren(...CURRENCY_CODES.filter((code) => code === 'EUR' || Number.isFinite(site.rates?.[code])).map((code) => h('option', { value: code }, code)));
  $('currency').addEventListener('change', (event) => { currency = event.target.value; saveCurrency(currency); render(); });
  $('status-next').textContent = `Next price check ${fmtNextScan()}`;
  document.querySelectorAll('[data-nav]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    const target = link.dataset.nav;
    if (target === 'explore') navigate({ ...route.query, to: 'anywhere' });
    else if (target === 'weekend') navigate({ ...route.query, to: 'anywhere' }, { weekend: true });
    else { location.hash = '#/'; setTimeout(() => $(target)?.scrollIntoView({ behavior: 'smooth' }), 50); }
  }));
  initDetails();
  initAsk({ site, navigate });
  render();
}

function showError(error) {
  $('view-home').replaceChildren(h('div', { class: 'container load-error' }, h('h2', {}, 'Couldn’t load today’s fares'), h('p', {}, 'Please refresh in a moment.')));
  console.error('Failed to load flight data', error);
}

async function load() {
  try {
    const [site, fares, priceHistory, photos] = await Promise.all([
      fetchJson('data/deals.json'),
      fetchJson('data/fares.json').catch(() => ({ destinations: {} })),
      fetchJson('data/history.json').then((body) => body.destinations ?? {}).catch(() => ({})),
      // Photos are optional: without them each destination gets a flat colour block.
      fetchJson('data/photos.json').then((body) => body.destinations ?? {}).catch(() => ({})),
    ]);
    start({ site, fares, priceHistory, photos });
  } catch (error) {
    showError(error);
  }
}

load();
