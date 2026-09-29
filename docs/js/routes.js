// "All routes" picture cards and the navy "Best deal" offer card.

import { $, h, icon } from './dom.js';
import { landscape } from './art.js';
import { flagEmoji, fmtDay, fmtEur, fmtShort, ORIGIN_NAMES, safeBookingUrl } from './format.js';

const PREVIEW_COUNT = 7;

function chipText(trip, isDeal) {
  if (!trip) return 'No fares yet';
  return isDeal ? `${fmtEur(trip.totalEur)} · ${fmtShort(trip.outDate)}` : `from ${fmtEur(trip.totalEur)}`;
}

function routeCard(dest, origin, limit) {
  const trip = dest.cheapest;
  const isDeal = Boolean(trip) && trip.totalEur <= limit;
  const url = trip && safeBookingUrl(trip.bookingUrl);
  const originName = ORIGIN_NAMES[origin.iata] ?? origin.name;
  return h('li', { class: isDeal ? 'route-card is-deal' : 'route-card' },
    landscape(dest.iata),
    h('p', { class: 'route-text' },
      h('span', { class: 'route-from' }, `${originName} – ${origin.iata} →`),
      h('strong', { class: 'route-to' }, `${dest.name} – ${dest.iata}`),
      h('span', { class: 'route-flag', 'aria-hidden': 'true' }, flagEmoji(dest.countryCode)),
    ),
    h('span', { class: 'route-chip' }, chipText(trip, isDeal)),
    url && h('a', { class: 'route-go', href: url, target: '_blank', rel: 'noopener noreferrer' },
      h('span', { class: 'sr-only' }, `Book ${dest.name} on Wizz Air, ${fmtDay(trip.outDate)} to ${fmtDay(trip.backDate)}`),
      icon('i-arrow'),
    ),
  );
}

export function renderRoutes({ data, destinations, expanded, onExpand }) {
  const limit = data.rules.maxReturnPriceEur;
  const shown = expanded ? destinations : destinations.slice(0, PREVIEW_COUNT);
  const hidden = destinations.length - shown.length;
  const more = hidden > 0 && h('li', { class: 'route-more' },
    h('button', { class: 'more-bubble', type: 'button', onclick: onExpand },
      `${hidden}+`, h('span', { class: 'sr-only' }, ' more routes')),
  );
  const empty = destinations.length === 0 && h('li', { class: 'route-empty' }, 'No route matches your search.');
  const items = [...shown.map((dest) => routeCard(dest, data.origin, limit)), more, empty].filter(Boolean);
  $('route-grid').replaceChildren(...items);
}

export function renderOffer(deals) {
  const best = deals[0];
  if (!best) {
    $('offer-price').textContent = '—';
    $('offer-dest').textContent = 'No deals right now';
    $('offer-dates').textContent = 'The next check runs in a few hours.';
    return;
  }
  const { dest, trip } = best;
  $('offer-price').textContent = fmtEur(trip.totalEur);
  $('offer-dest').textContent = `${dest.name}, ${dest.country}`;
  $('offer-dates').textContent = `${fmtDay(trip.outDate)} → ${fmtDay(trip.backDate)}`;
  const url = safeBookingUrl(trip.bookingUrl);
  if (url) {
    const cta = $('offer-cta');
    cta.href = url;
    cta.target = '_blank';
    cta.rel = 'noopener noreferrer';
    cta.hidden = false;
  }
}
