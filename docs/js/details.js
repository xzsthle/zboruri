// Flight details dialog: itinerary timeline, fare rules, destination facts, price box and actions.

import { $, h, icon } from './dom.js';
import { downloadIcs, shareTrip } from './actions.js';
import { priceHistory } from './history-chart.js';
import { priceCalendar } from './pickers.js';
import { hoursBetween, nowIn } from './geo.js';
import { fmtDay, ORIGIN_NAMES, plural } from './format.js';
import { arrivalLabel, bookingLink, bookLabel, durationLabel, flightInfo, stopsLabel } from './flight.js';
import { toHash } from './query.js';
import { photoImg } from './photo.js';
import { colorBlock } from './art.js';

const WIZZ_BASIC = {
  included: ['One personal item under the seat (40 × 30 × 20 cm)', 'Direct flight, no stops'],
  extra: ['Cabin trolley up to 10 kg (with WIZZ Priority)', 'Checked bags', 'Seat selection'],
};

const placeLine = (place) => `${place.airportName ?? place.name} (${place.iata})`;

function itineraryLeg(label, trip, leg) {
  const cityOf = (place) => (ORIGIN_NAMES[place.iata] ?? place.name);
  return h('section', { class: 'it-leg' },
    h('header', { class: 'it-head' },
      h('span', { class: 'it-label' }, label),
      h('strong', {}, fmtDay(leg.date)),
      h('span', { class: 'it-sub' }, `${trip.airline} · ${stopsLabel(leg.stops)}`)),
    h('ol', { class: 'it-timeline' },
      h('li', { class: 'it-stop' },
        h('time', {}, leg.dep ?? '—'),
        h('div', {}, h('strong', {}, placeLine(leg.from)), h('span', {}, `${cityOf(leg.from)}, ${leg.from.country}`))),
      h('li', { class: 'it-flight' },
        icon('i-plane'),
        leg.minutes == null ? 'Flight time unknown'
          : leg.stops > 0 ? `${durationLabel(leg)} in total, with ${stopsLabel(leg.stops)}` : `${durationLabel(leg)} flight`),
      h('li', { class: 'it-stop' },
        h('time', {}, arrivalLabel(leg), leg.arr?.nextDay && h('sup', {}, '+1')),
        h('div', {}, h('strong', {}, placeLine(leg.to)), h('span', {}, `${cityOf(leg.to)}, ${leg.to.country}`)))));
}

function fareRules(trip) {
  if (trip.source !== 'wizz') {
    return h('section', { class: 'info-card' }, h('h4', {}, 'Fare & baggage'),
      h('p', {}, `This is a recently seen ${trip.airline} fare from Aviasales. Baggage rules and the final price depend on the fare you pick there.`));
  }
  return h('section', { class: 'info-card' }, h('h4', {}, 'What’s included (Wizz Air Basic)'),
    h('ul', { class: 'rule-list' },
      WIZZ_BASIC.included.map((item) => h('li', { class: 'is-in' }, icon('i-check'), item)),
      WIZZ_BASIC.extra.map((item) => h('li', { class: 'is-extra' },
        h('span', { class: 'rule-plus', 'aria-hidden': 'true' }, '+'), item, h('span', { class: 'rule-tag' }, 'extra')))));
}

function destinationFacts(info, site) {
  const { dest } = info;
  const diff = hoursBetween(site.origin.timeZone, dest.timeZone);
  const facts = [
    ['Local time now', dest.timeZone ? nowIn(dest.timeZone) : null],
    ['Time difference', diff == null ? null : diff === 0 ? 'Same as Chișinău' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} h vs Chișinău`],
    ['Distance', info.km ? `${info.km.toLocaleString('en-US')} km` : null],
    ['Flight time', durationLabel(info.out)],
    ['Local currency', dest.localCurrency],
    ['Airport', dest.airportName ?? null],
  ].filter(([, value]) => value);
  return h('section', { class: 'info-card' },
    h('h4', {}, `About ${dest.name}`),
    h('dl', { class: 'facts' }, facts.map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', {}, value)))));
}

function priceBox({ trip, info, site, money, query }) {
  const url = bookingLink(trip, site, query.adults);
  const shareUrl = new URL(toHash({ ...query, to: trip.iata, depart: trip.outDate, back: trip.backDate }), location.href).href;
  const live = trip.source === 'wizz';
  return h('section', { class: 'tile tile--dark price-box' },
    h('span', { class: live ? 'source' : 'source is-recent' }, live ? 'Live price' : 'Recently seen price'),
    h('p', { class: 'pb-price' }, money.format(trip.pricePp)),
    h('p', { class: 'pb-meta' }, 'per person, return'),
    query.adults > 1 && h('p', { class: 'pb-meta' }, `${money.format(trip.pricePp * query.adults)} total for ${plural(query.adults, 'adult')}`),
    trip.outEur != null && h('p', { class: 'pb-meta' }, `Outbound ${money.format(trip.outEur)} · Return ${money.format(trip.backEur)}`),
    url && h('a', { class: 'btn-accent btn-block pb-book', href: url, target: '_blank', rel: 'noopener noreferrer' }, bookLabel(trip), icon('i-external')),
    h('div', { class: 'pb-actions' },
      h('button', { type: 'button', class: 'btn-outline', onclick: () => shareTrip({ dest: info.dest, trip, money, url: shareUrl }) }, icon('i-share'), 'Share'),
      h('button', { type: 'button', class: 'btn-outline', onclick: () => downloadIcs({ dest: info.dest, trip, origin: site.origin, money, bookingUrl: url }) }, icon('i-calendar-plus'), 'Calendar')),
    h('p', { class: 'pb-note' }, live
      ? 'Wizz Air’s lowest fare when we last checked. Arrival times are estimated from distance.'
      : 'Seen by other travellers recently. Confirm the price before booking.'));
}

/** The destination photo (or its colour block) with the route's facts in a stat pill. */
function photoTile(photo, info) {
  const { dest } = info;
  const facts = [stopsLabel(info.out.stops), durationLabel(info.out), info.km && `${info.km.toLocaleString('en-US')} km`, dest.localCurrency && `pays in ${dest.localCurrency}`].filter(Boolean);
  return h('div', { class: 'dlg-photo photo-tile has-scrim' },
    photoImg(photo, { width: 720, height: 260, className: 'cover dlg-img', eager: true, alt: `${dest.name}, ${dest.country}` }) ?? colorBlock(dest.iata, 'cover'),
    h('span', { class: 'tag-pill dlg-country' }, dest.country),
    h('p', { class: 'stat-pill dlg-facts' }, facts.map((fact) => h('span', {}, fact))));
}

export function openDetails({ trip, site, engine, money, query, history, photos = {}, onChangeDate }) {
  const info = flightInfo(trip, site, engine);
  const dialog = $('details');
  const range = engine.dateRange();
  const calendar = range && priceCalendar({
    prices: engine.pricesByDepartDay({ ...query, to: trip.iata, back: '' }, trip.iata),
    selected: trip.outDate, minDate: range.first, maxDate: range.last, money,
    onPick: (date) => { dialog.close(); onChangeDate(trip.iata, date); },
  });

  dialog.replaceChildren(h('div', { class: 'dlg' },
    h('span', { class: 'dlg-handle', 'aria-hidden': 'true' }),
    h('header', { class: 'dlg-head' },
      h('div', {},
        h('h2', { class: 'dlg-title' }, `${ORIGIN_NAMES[site.origin.iata] ?? site.origin.name} → ${info.dest.name}`),
        h('p', { class: 'dlg-sub' }, `${fmtDay(trip.outDate)} – ${fmtDay(trip.backDate)} · ${plural(trip.nights, 'night')} · ${plural(query.adults, 'adult')}`)),
      h('button', { type: 'button', class: 'orb orb--light dlg-close', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('i-close'))),
    h('div', { class: 'dlg-body' },
      h('div', { class: 'dlg-main' },
        photoTile(photos[trip.iata], info),
        itineraryLeg('Outbound', trip, info.out),
        itineraryLeg('Return', trip, info.back),
        fareRules(trip),
        destinationFacts(info, site),
        calendar && h('section', { class: 'info-card' }, h('h4', {}, 'Change dates'), h('p', { class: 'info-sub' }, 'Cheapest return by departure day.'), calendar),
        priceHistory({ points: history[trip.iata], current: trip.pricePp, money })),
      h('aside', { class: 'dlg-side' }, priceBox({ trip, info, site, money, query })))));
  dialog.showModal();
  dialog.querySelector('.dlg-close').focus();
}

export function initDetails() {
  const dialog = $('details');
  // Close when the backdrop (the dialog element itself, outside the panel) is clicked.
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}
