// Home page sections: the cheapest-destinations bento, weekends, cheapest months, how it works and the route map.

import { $, h, icon } from './dom.js';
import { destinationCard } from './card.js';
import { colorBlock } from './art.js';
import { renderMap } from './map.js';
import { monthBars } from './months.js';
import { DEFAULT_FILTERS } from './query.js';
import { flightInfo } from './flight.js';
import { photoImg } from './photo.js';
import { fmtAgo, fmtDay, fmtNextScan, plural } from './format.js';

const POPULAR_COUNT = 8;
const MORE_CHIPS = 8;
const WEEKEND_COUNT = 4;

function weekendRow({ dest, best }, { money, photo, onSelect }) {
  return h('button', { type: 'button', class: 'wk', onclick: onSelect },
    h('span', { class: 'wk-thumb', 'aria-hidden': 'true' }, photoImg(photo, { width: 56, height: 56, className: 'wk-photo', alt: '' }) ?? colorBlock(dest.iata)),
    h('span', { class: 'wk-text' }, h('strong', {}, dest.name), h('span', {}, `${fmtDay(best.outDate)} → ${fmtDay(best.backDate)}`)),
    h('span', { class: 'wk-price' }, money.format(best.pricePp)),
    h('span', { class: 'orb orb--sunk orb--sm wk-orb', 'aria-hidden': 'true' }, icon('i-arrow')));
}

/** The accent tile closing the bento: chips for the next cheapest cities and a way to see them all. */
function moreTile({ total, rows, onCity, onAll }) {
  return h('article', { class: 'tile tile--accent dc-more' },
    h('h3', { class: 'dc-more-title' }, `Explore all ${total} destinations`),
    h('ul', { class: 'dc-more-chips', 'aria-label': 'More cheap cities' },
      rows.map(({ dest }) => h('li', {}, h('button', { type: 'button', class: 'chip chip--on-accent', onclick: () => onCity(dest.iata) }, dest.name)))),
    h('button', { type: 'button', class: 'pill-orb pill-orb--accent', id: 'popular-all', onclick: onAll },
      `See all ${total}`, h('span', { class: 'orb' }, icon('i-arrow'))));
}

// Pagination dashes under the phone carousel. One observer at a time; renderHome runs on every re-render.
let dashObserver = null;

function carouselDashes(grid, dashes) {
  dashObserver?.disconnect();
  const tiles = [...grid.children];
  const marks = tiles.map(() => h('span', { class: 'dash' }));
  dashes.replaceChildren(...marks);
  const setActive = (index) => marks.forEach((mark, i) => mark.classList.toggle('is-active', i === index));
  setActive(0);
  dashObserver = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => setActive(tiles.indexOf(entry.target)));
  }, { root: grid, threshold: 0.6 });
  tiles.forEach((tile) => dashObserver.observe(tile));
}

export function renderHome({ site, engine, query, money, navigate, photos }) {
  const explore = engine.explore(query, DEFAULT_FILTERS);
  const weekends = engine.explore(query, { ...DEFAULT_FILTERS, weekend: true }).slice(0, WEEKEND_COUNT);
  const limit = site.rules.maxReturnPriceEur;
  const deals = explore.filter((row) => row.best.pricePp <= limit);
  const total = site.destinations.length;
  const go = (iata) => () => navigate({ ...query, to: iata });
  const everywhere = () => navigate({ ...query, to: 'anywhere' });

  $('hero-stats').replaceChildren(
    h('li', {}, h('strong', {}, String(total)), ' destinations'),
    h('li', {}, h('strong', {}, String(deals.length)), ` under ${money.format(limit)} return`),
    explore[0] && h('li', {}, 'from ', h('strong', {}, money.format(explore[0].best.pricePp))),
    h('li', {}, 'updated ', h('strong', {}, fmtAgo(site.generatedAt))));

  const tiles = explore.slice(0, POPULAR_COUNT).map((row, i) => destinationCard({
    ...row, money, photo: photos[row.dest.iata], info: flightInfo(row.best, site, engine), onSelect: go(row.dest.iata), featured: i === 0,
  }));
  $('popular-grid').replaceChildren(...tiles,
    moreTile({ total, rows: explore.slice(POPULAR_COUNT, POPULAR_COUNT + MORE_CHIPS), onCity: (iata) => go(iata)(), onAll: everywhere }));
  carouselDashes($('popular-grid'), $('popular-dashes'));

  $('weekend-list').replaceChildren(...(weekends.length
    ? weekends.map((row) => weekendRow(row, { money, photo: photos[row.dest.iata], onSelect: go(row.dest.iata) }))
    : [h('p', { class: 'muted' }, 'No weekend trips right now.')]));
  $('weekend-all').onclick = () => navigate({ ...query, to: 'anywhere' }, { weekend: true });
  $('months-chart').replaceChildren(monthBars({
    prices: engine.pricesByMonth(query), money, label: 'Cheapest return by month, anywhere',
    onPick: (month) => navigate({ ...query, to: 'anywhere', depart: month }),
  }) ?? h('p', { class: 'muted' }, 'No fares yet.'));
  $('how-stats').replaceChildren(
    h('span', {}, plural(total, 'route')), h('span', {}, plural(deals.length, 'deal')), h('span', {}, `next check ${fmtNextScan()}`));

  const bestDeals = new Map(deals.map((row) => [row.dest.iata, { totalEur: row.best.pricePp, outDate: row.best.outDate }]));
  renderMap({ data: site, bestDeals, selectedIata: null, money, onSelect: (iata) => navigate({ ...query, to: iata }) });
  const direct = site.destinations.filter((dest) => dest.direct !== false).length;
  const viaStop = total - direct;
  $('map-meta').textContent = `${plural(direct, 'direct route')}${viaStop ? ` · ${viaStop} more with a stop` : ''} · ${plural(bestDeals.size, 'deal')} under ${money.format(limit)}. Tap one to search it.`;
}
