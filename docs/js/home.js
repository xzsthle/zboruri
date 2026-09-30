// Home page sections: popular destinations, weekend escapes, cheapest months and the route map.

import { $, h, icon } from './dom.js';
import { destinationCard } from './card.js';
import { renderMap } from './map.js';
import { DEFAULT_FILTERS } from './query.js';
import { flightInfo } from './flight.js';
import { photoImg } from './photo.js';
import { flagEmoji, fmtAgo, fmtDay, fmtMonthLong, plural } from './format.js';

const POPULAR_COUNT = 8;
const WEEKEND_COUNT = 4;

function weekendCard({ dest, best }, { money, photo, onSelect }) {
  return h('button', { type: 'button', class: 'wk', onclick: onSelect },
    h('span', { class: 'wk-flag', 'aria-hidden': 'true' }, photoImg(photo, { width: 56, height: 56, className: 'wk-photo', alt: '' }) ?? flagEmoji(dest.countryCode)),
    h('span', { class: 'wk-text' }, h('strong', {}, dest.name), h('span', {}, `${fmtDay(best.outDate)} → ${fmtDay(best.backDate)}`)),
    h('span', { class: 'wk-price' }, money.format(best.pricePp)),
    icon('i-arrow', 'icon wk-arrow'));
}

function monthsChart({ engine, query, money, navigate }) {
  const prices = engine.pricesByMonth(query);
  const values = [...prices.values()];
  const max = Math.max(...values);
  const cheapest = Math.min(...values);
  return h('div', { class: 'months-chart', role: 'group', 'aria-label': 'Cheapest return by month, anywhere' },
    [...prices.entries()].map(([month, price]) => {
      const [y, m] = month.split('-').map(Number);
      return h('button', {
        type: 'button', class: price === cheapest ? 'mc-col is-cheapest' : 'mc-col',
        style: { '--fill': String(0.2 + 0.8 * (price / max)) },
        onclick: () => navigate({ ...query, to: 'anywhere', depart: month }),
      }, h('span', { class: 'mc-price' }, money.format(price)), h('span', { class: 'mc-bar', 'aria-hidden': 'true' }), h('span', { class: 'mc-label' }, fmtMonthLong(y, m - 1).split(' ')[0].slice(0, 3)));
    }));
}

export function renderHome({ site, engine, query, money, navigate, photos }) {
  const explore = engine.explore(query, DEFAULT_FILTERS);
  const weekends = engine.explore(query, { ...DEFAULT_FILTERS, weekend: true }).slice(0, WEEKEND_COUNT);
  const limit = site.rules.maxReturnPriceEur;
  const deals = explore.filter((row) => row.best.pricePp <= limit);
  const go = (iata) => () => navigate({ ...query, to: iata });

  $('hero-stats').replaceChildren(
    h('li', {}, h('strong', {}, String(site.destinations.length)), ' destinations'),
    h('li', {}, h('strong', {}, String(deals.length)), ` under ${money.format(limit)} return`),
    explore[0] && h('li', {}, 'from ', h('strong', {}, money.format(explore[0].best.pricePp))),
    h('li', {}, 'updated ', h('strong', {}, fmtAgo(site.generatedAt))));

  $('popular-grid').replaceChildren(...explore.slice(0, POPULAR_COUNT).map((row) => destinationCard({
    ...row, money, photo: photos[row.dest.iata], info: flightInfo(row.best, site, engine), onSelect: go(row.dest.iata),
  })));
  $('weekend-list').replaceChildren(...(weekends.length
    ? weekends.map((row) => weekendCard(row, { money, photo: photos[row.dest.iata], onSelect: go(row.dest.iata) }))
    : [h('p', { class: 'muted' }, 'No weekend trips right now.')]));
  $('weekend-all').onclick = () => navigate({ ...query, to: 'anywhere' }, { weekend: true });
  $('popular-all').onclick = () => navigate({ ...query, to: 'anywhere' });
  $('months-chart').replaceChildren(monthsChart({ engine, query, money, navigate }));

  const bestDeals = new Map(explore.filter((row) => row.best.pricePp <= limit).map((row) => [row.dest.iata, { totalEur: row.best.pricePp, outDate: row.best.outDate }]));
  renderMap({ data: site, bestDeals, selectedIata: null, money, onSelect: (iata) => navigate({ ...query, to: iata }) });
  $('map-meta').textContent = `${plural(site.destinations.length, 'destination')} · ${plural(bestDeals.size, 'deal')} under ${money.format(limit)}. Tap one to search it.`;
}
