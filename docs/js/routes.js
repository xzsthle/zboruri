// "All routes" picture cards and the navy "Best deal" offer card.

import { $, h, icon } from './dom.js';
import { landscape } from './art.js';
import { flagEmoji, fmtDay, fmtShort, ORIGIN_NAMES, safeBookingUrl } from './format.js';

const PREVIEW_COUNT = 8;

function chipText(trip, isDeal, money) {
  if (!trip) return 'No fares yet';
  return isDeal ? `${money.format(trip.totalEur)} · ${fmtShort(trip.outDate)}` : `from ${money.format(trip.totalEur)}`;
}

function routeCard(dest, { origin, limit, money }) {
  const trip = dest.cheapest;
  const isDeal = Boolean(trip) && trip.totalEur <= limit;
  const url = trip && safeBookingUrl(trip.bookingUrl);
  const originName = ORIGIN_NAMES[origin.iata] ?? origin.name;
  const airlines = dest.airlines?.length ? dest.airlines.join(' · ') : null;
  return h('li', { class: isDeal ? 'route-card is-deal' : 'route-card' },
    landscape(dest.iata),
    h('p', { class: 'route-text' },
      h('span', { class: 'route-from' }, `${originName} – ${origin.iata} →`),
      h('strong', { class: 'route-to' }, `${dest.name} – ${dest.iata}`),
      airlines && h('span', { class: 'route-airline' }, airlines),
      h('span', { class: 'route-flag', 'aria-hidden': 'true' }, flagEmoji(dest.countryCode))),
    h('span', { class: 'route-chip' }, chipText(trip, isDeal, money)),
    url && h('a', { class: 'route-go', href: url, target: '_blank', rel: 'noopener noreferrer' },
      h('span', { class: 'sr-only' }, `Book ${dest.name}, ${fmtDay(trip.outDate)} to ${fmtDay(trip.backDate)}`),
      icon('i-arrow')));
}

export function renderRoutes({ data, destinations, expanded, money, onExpand }) {
  const context = { origin: data.origin, limit: data.rules.maxReturnPriceEur, money };
  const shown = expanded ? destinations : destinations.slice(0, PREVIEW_COUNT);
  const hidden = destinations.length - shown.length;
  const more = hidden > 0 && h('li', { class: 'route-more' },
    h('button', { class: 'more-bubble', type: 'button', onclick: onExpand }, `${hidden}+`, h('span', { class: 'sr-only' }, ' more routes')));
  const empty = destinations.length === 0 && h('li', { class: 'route-empty' }, 'No route matches your search.');
  const items = [...shown.map((dest) => routeCard(dest, context)), more, empty].filter(Boolean);
  $('route-grid').replaceChildren(...items);
}

export function renderOffer(deals, money) {
  const best = deals[0];
  if (!best) {
    $('offer-price').textContent = '—';
    $('offer-dest').textContent = 'No deals right now';
    $('offer-dates').textContent = 'The next check runs in a few hours.';
    $('offer-cta').hidden = true;
    return;
  }
  const { dest, trip } = best;
  $('offer-price').textContent = money.format(trip.totalEur);
  $('offer-dest').textContent = `${dest.name}, ${dest.country}`;
  $('offer-dates').textContent = `${fmtDay(trip.outDate)} → ${fmtDay(trip.backDate)} · ${trip.airline}`;
  const url = safeBookingUrl(trip.bookingUrl);
  const cta = $('offer-cta');
  cta.hidden = !url;
  if (url) {
    cta.href = url;
    cta.target = '_blank';
    cta.rel = 'noopener noreferrer';
  }
}
