// Entry point: loads docs/data/deals.json (written by the scanner) and wires the views to URL state.

import { $, h } from './dom.js';
import { allDeals, groupByDestination, matchesQuery } from './data.js';
import { initRail, renderChrome, renderMonths } from './chrome.js';
import { renderOffer, renderRoutes } from './routes.js';
import { centerSelectedCard, initCarouselNav, renderShowcase } from './showcase.js';

const DATA_URL = 'data/deals.json';

// Filters and the selected destination live in the URL so a view can be shared.
function readUrlState() {
  const params = new URLSearchParams(location.search);
  return { month: params.get('month'), dest: params.get('dest'), query: params.get('q') ?? '', allRoutes: false };
}

function writeUrlState({ month, dest, query }) {
  const url = new URL(location.href);
  Object.entries({ month, dest, q: query.trim() }).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  history.replaceState(null, '', url);
}

function start(data) {
  const deals = allDeals(data);
  let state = readUrlState();

  const render = () => {
    const inMonth = state.month ? deals.filter(({ trip }) => trip.outDate.startsWith(state.month)) : deals;
    const groups = groupByDestination(inMonth.filter(({ dest }) => matchesQuery(dest, state.query)));
    const selected = groups.find(([first]) => first.dest.iata === state.dest) ?? groups[0] ?? null;

    renderMonths(data, deals, state.month, (month) => setState({ month, dest: null }));
    renderShowcase({
      data,
      groups,
      selected,
      emptyMessage: state.query ? `No deals match “${state.query.trim()}”.` : 'No deals leave in this month.',
      onSelect: (iata) => { setState({ dest: iata }); centerSelectedCard(); },
    });
    renderRoutes({
      data,
      destinations: data.destinations.filter((dest) => matchesQuery(dest, state.query)),
      expanded: state.allRoutes || Boolean(state.query),
      onExpand: () => setState({ allRoutes: true }),
    });
  };

  function setState(patch) {
    state = { ...state, ...patch };
    writeUrlState(state);
    render();
  }

  renderChrome(data, deals);
  renderOffer(deals);
  initCarouselNav();
  initRail();

  const search = $('search');
  search.value = state.query;
  search.addEventListener('input', () => setState({ query: search.value, dest: null }));
  render();
}

function showError(error) {
  $('carousel').replaceChildren(h('div', { class: 'deal-empty' }, h('p', {}, 'Couldn’t load today’s fares. Refresh in a moment.')));
  $('status-updated').textContent = 'Offline';
  console.error('Failed to load deals', error);
}

async function load() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    start(await res.json());
  } catch (error) {
    showError(error);
  }
}

load();
