// "Today at a glance": four KPI tiles computed from the deals matching the current filters.

import { $, h, icon } from './dom.js';
import { isWeekendTrip, median } from './data.js';
import { fmtDay, fmtShort, plural } from './format.js';

const cheapestOf = (deals) => deals.reduce((best, deal) => (!best || deal.trip.totalEur < best.trip.totalEur ? deal : best), null);

const tile = ({ iconId, label, value, sub, hero = false }) =>
  h('article', { class: hero ? 'kpi is-hero' : 'kpi' },
    h('span', { class: 'kpi-icon', 'aria-hidden': 'true' }, icon(iconId)),
    h('p', { class: 'kpi-label' }, label),
    h('p', { class: 'kpi-value' }, value),
    h('p', { class: 'kpi-sub' }, sub));

export function renderInsights({ data, deals, money }) {
  const limit = data.rules.maxReturnPriceEur;
  const cheapest = cheapestOf(deals);
  const weekend = cheapestOf(deals.filter(({ trip }) => isWeekendTrip(trip)));
  const typical = median(deals.map(({ trip }) => trip.totalEur));
  const destinations = new Set(deals.map(({ dest }) => dest.iata)).size;

  $('insights').replaceChildren(
    tile({
      hero: true,
      iconId: 'i-bolt',
      label: 'Cheapest return',
      value: cheapest ? money.format(cheapest.trip.totalEur) : '—',
      sub: cheapest ? `${cheapest.dest.name} · ${fmtShort(cheapest.trip.outDate)}` : 'Nothing matches these filters',
    }),
    tile({
      iconId: 'i-flame',
      label: 'Deals found',
      value: String(deals.length),
      sub: `across ${plural(destinations, 'destination')}`,
    }),
    tile({
      iconId: 'i-chart',
      label: 'Typical deal',
      value: typical == null ? '—' : money.format(typical),
      sub: typical == null ? 'No deals to compare' : `${money.format(limit - typical)} under your ${money.format(limit)} limit`,
    }),
    tile({
      iconId: 'i-sun',
      label: 'Best weekend',
      value: weekend ? money.format(weekend.trip.totalEur) : '—',
      sub: weekend ? `${weekend.dest.name} · ${fmtDay(weekend.trip.outDate)} → ${fmtDay(weekend.trip.backDate)}` : 'No weekend trips under the limit',
    }),
  );
}
