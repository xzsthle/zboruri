// Result cards: a flight card (outbound + return legs, price, Select) and an "Everywhere" destination card.

import { h, icon } from './dom.js';
import { colorBlock } from './art.js';
import { fmtDay, fmtShortRange, plural } from './format.js';
import { airlineBadge, arrivalLabel, durationLabel, stopsLabel } from './flight.js';
import { photoImg } from './photo.js';

function legRow(label, trip, leg) {
  const duration = durationLabel(leg) ?? stopsLabel(leg.stops);
  return h('div', { class: 'leg' },
    h('div', { class: 'leg-airline' },
      h('span', { class: 'al-badge', 'aria-hidden': 'true' }, airlineBadge(trip)),
      h('span', { class: 'leg-meta' }, h('strong', {}, label), h('span', {}, `${fmtDay(leg.date)} · ${trip.airline}`))),
    h('div', { class: 'leg-point' }, h('strong', {}, leg.dep ?? '—'), h('span', {}, leg.from.iata)),
    h('div', { class: 'leg-path', 'aria-hidden': 'true' },
      h('span', { class: 'leg-dur' }, duration),
      h('span', { class: 'leg-line' }, icon('i-plane', 'icon leg-plane')),
      h('span', { class: leg.stops > 0 ? 'leg-stops has-stops' : 'leg-stops' }, stopsLabel(leg.stops))),
    h('div', { class: 'leg-point is-end' },
      h('strong', {}, arrivalLabel(leg), leg.arr?.nextDay && h('sup', {}, '+1')),
      h('span', {}, leg.to.iata)),
    h('p', { class: 'sr-only' },
      `${label}: ${fmtDay(leg.date)}, departs ${leg.from.name ?? leg.from.iata} at ${leg.dep ?? 'unknown time'}, ` +
        `arrives ${leg.to.name ?? leg.to.iata} ${leg.estimated ? 'around ' : 'at '}${leg.arr?.time ?? 'unknown time'}, ${duration}, ${stopsLabel(leg.stops)}, ${trip.airline}.`));
}

const BADGES = { best: 'Best', cheapest: 'Cheapest', soonest: 'Soonest' };

export function resultCard({ trip, info, money, adults, badges = [], onSelect }) {
  const live = trip.source === 'wizz';
  return h('article', { class: 'rc' },
    h('div', { class: 'rc-legs' }, legRow('Outbound', trip, info.out), legRow('Return', trip, info.back)),
    h('div', { class: 'rc-side' },
      h('div', { class: 'rc-tags' },
        badges[0] && h('span', { class: 'badge' }, BADGES[badges[0]]),
        h('span', { class: live ? 'source' : 'source is-recent' }, live ? 'Live' : 'Recent', h('span', { class: 'sr-only' }, ' price'))),
      h('p', { class: 'rc-price' }, money.format(trip.pricePp)),
      h('p', { class: 'rc-meta' }, adults > 1 ? `per person · ${money.format(trip.pricePp * adults)} total for ${plural(adults, 'adult')}` : 'per person'),
      h('p', { class: 'rc-meta' }, `${plural(trip.nights, 'night')} in ${info.dest.name}`),
      h('button', { type: 'button', class: 'btn-select', onclick: onSelect }, 'Select')));
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
        h('span', {}, [stopsLabel(info.out.stops), durationLabel(info.out)].filter(Boolean).join(' · ')),
        h('span', {}, fmtShortRange(best.outDate, best.backDate))),
      featured && h('p', { class: 'dc-count' }, `${plural(count, 'date option')} · ${best.airline}`)),
    featured
      ? h('span', { class: 'dc-notch', 'aria-hidden': 'true' }, h('span', { class: 'orb orb--lg' }, icon('i-external')))
      : h('span', { class: 'orb orb--light dc-orb', 'aria-hidden': 'true' }, icon('i-external')));
}
