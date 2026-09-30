// Result cards: a flight card (outbound + return legs, price, Select) and an "Everywhere" destination card.

import { h, icon } from './dom.js';
import { landscape } from './art.js';
import { fmtDuration } from './geo.js';
import { flagEmoji, fmtDay, fmtShort, plural } from './format.js';
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

export function destinationCard({ dest, best, count, info, money, photo, onSelect }) {
  return h('article', { class: 'dc' },
    h('button', { type: 'button', class: 'dc-hit', onclick: onSelect, 'aria-label': `${dest.name}, ${dest.country}: from ${money.format(best.pricePp)} return` }),
    h('div', { class: 'dc-art' },
      photoImg(photo, { width: 480, height: 270, className: 'dc-photo', alt: `${dest.name}, ${dest.country}` }) ?? landscape(dest.iata),
      h('span', { class: 'dc-flag', 'aria-hidden': 'true' }, flagEmoji(dest.countryCode)),
      photoCredit(photo)),
    h('div', { class: 'dc-body' },
      h('div', { class: 'dc-row' },
        h('div', {}, h('h3', { class: 'dc-name' }, dest.name), h('p', { class: 'dc-country' }, dest.country)),
        h('p', { class: 'dc-price' }, h('small', {}, 'from'), money.format(best.pricePp))),
      h('p', { class: 'dc-meta' },
        h('span', {}, icon('i-plane'), info.minutes ? `Direct · ≈ ${fmtDuration(info.minutes)}` : 'Direct'),
        h('span', {}, icon('i-calendar'), `${fmtShort(best.outDate)} – ${fmtShort(best.backDate)}`)),
      h('p', { class: 'dc-count' }, `${plural(count, 'date option')} · ${best.airline}`)));
}
