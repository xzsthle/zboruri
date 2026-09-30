// Result cards: a flight card (outbound + return legs, price, Select) and an "Everywhere" destination card.

import { h, icon } from './dom.js';
import { colorBlock } from './art.js';
import { fmtDuration } from './geo.js';
import { fmtDay, fmtShortRange, plural } from './format.js';
import { airlineBadge } from './flight.js';
import { photoCredit, photoImg } from './photo.js';

function legRow(label, trip, leg) {
  const duration = leg.minutes == null ? 'Direct' : `≈ ${fmtDuration(leg.minutes)}`;
  return h('div', { class: 'leg' },
    h('div', { class: 'leg-airline' },
      h('span', { class: 'al-badge', 'aria-hidden': 'true' }, airlineBadge(trip)),
      h('span', { class: 'leg-meta' }, h('strong', {}, label), h('span', {}, `${fmtDay(leg.date)} · ${trip.airline}`))),
    h('div', { class: 'leg-point' }, h('strong', {}, leg.dep ?? '—'), h('span', {}, leg.from.iata)),
    h('div', { class: 'leg-path', 'aria-hidden': 'true' },
      h('span', { class: 'leg-dur' }, duration),
      h('span', { class: 'leg-line' }, icon('i-plane', 'icon leg-plane')),
      h('span', { class: 'leg-stops' }, trip.stops > 0 ? plural(trip.stops, 'stop') : 'Direct')),
    h('div', { class: 'leg-point is-end' },
      h('strong', {}, leg.arr ? `≈ ${leg.arr.time}` : '—', leg.arr?.nextDay && h('sup', {}, '+1')),
      h('span', {}, leg.to.iata)),
    h('p', { class: 'sr-only' },
      `${label}: ${fmtDay(leg.date)}, departs ${leg.from.name ?? leg.from.iata} at ${leg.dep ?? 'unknown time'}, ` +
        `arrives ${leg.to.name ?? leg.to.iata} around ${leg.arr?.time ?? 'unknown time'}, ${duration}, ${trip.airline}.`));
}

const BADGES = {
  best: ['Best', 'is-best'],
  cheapest: ['Cheapest', 'is-cheapest'],
  soonest: ['Soonest', 'is-soonest'],
};

export function resultCard({ trip, info, money, adults, badges = [], onSelect }) {
  const total = trip.pricePp * adults;
  return h('article', { class: 'rc' },
    h('div', { class: 'rc-legs' }, legRow('Outbound', trip, info.out), legRow('Return', trip, info.back)),
    h('div', { class: 'rc-side' },
      h('div', { class: 'rc-badges' },
        badges.map((key) => h('span', { class: `badge ${BADGES[key][1]}` }, BADGES[key][0])),
        h('span', { class: trip.source === 'wizz' ? 'badge is-live' : 'badge is-cached' }, trip.source === 'wizz' ? 'Live price' : 'Recent price')),
      h('p', { class: 'rc-price' }, money.format(trip.pricePp), h('small', {}, ' per person')),
      adults > 1 && h('p', { class: 'rc-total' }, `${money.format(total)} total for ${plural(adults, 'adult')}`),
      h('p', { class: 'rc-stay' }, `${plural(trip.nights, 'night')} in ${info.dest.name}`),
      h('button', { type: 'button', class: 'btn-select', onclick: onSelect }, 'Select', icon('i-arrow'))));
}

/** A photo tile: country and price pills on top, the city and a stat pill at the bottom. */
export function destinationCard({ dest, best, count, info, money, photo, onSelect, featured = false }) {
  const size = featured ? 760 : 520;
  return h('article', { class: featured ? 'dc photo-tile has-scrim is-featured' : 'dc photo-tile has-scrim' },
    photoImg(photo, { width: size, height: size, className: 'cover dc-photo', alt: `${dest.name}, ${dest.country}` }) ?? colorBlock(dest.iata, 'cover'),
    h('button', { type: 'button', class: 'dc-hit', onclick: onSelect, 'aria-label': `${dest.name}, ${dest.country}: from ${money.format(best.pricePp)} return` }),
    h('span', { class: 'tag-pill dc-country' }, dest.country),
    h('span', { class: 'price-pill dc-price' }, h('small', {}, 'from'), money.format(best.pricePp)),
    h('div', { class: 'dc-body' },
      h('h3', { class: 'dc-name' }, dest.name),
      h('p', { class: 'stat-pill dc-stats' },
        h('span', {}, info.minutes ? `Direct · ≈ ${fmtDuration(info.minutes)}` : 'Direct'),
        h('span', {}, fmtShortRange(best.outDate, best.backDate))),
      featured && h('p', { class: 'dc-count' }, `${plural(count, 'date option')} · ${best.airline}`)),
    featured
      ? h('span', { class: 'dc-notch', 'aria-hidden': 'true' }, h('span', { class: 'orb orb--lg' }, icon('i-external')))
      : h('span', { class: 'orb orb--light dc-orb', 'aria-hidden': 'true' }, icon('i-external')),
    photoCredit(photo));
}
