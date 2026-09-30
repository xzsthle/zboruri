// Flight details dialog: itinerary timeline, fare rules, destination facts, price box and actions.

import { $, h, icon } from './dom.js';
import { downloadIcs, shareTrip } from './actions.js';
import { priceHistory } from './history-chart.js';
import { priceCalendar } from './pickers.js';
import { fmtDuration, hoursBetween, nowIn } from './geo.js';
import { flagEmoji, fmtDay, ORIGIN_NAMES, plural } from './format.js';
import { bookingLink, bookLabel, flightInfo } from './flight.js';
import { toHash } from './query.js';
import { photoCredit, photoImg } from './photo.js';

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
      h('span', { class: 'it-sub' }, `${trip.airline} · ${trip.stops > 0 ? plural(trip.stops, 'stop') : 'Direct'}`)),
    h('ol', { class: 'it-timeline' },
      h('li', { class: 'it-stop' },
        h('time', {}, leg.dep ?? '—'),
        h('div', {}, h('strong', {}, placeLine(leg.from)), h('span', {}, `${cityOf(leg.from)}, ${leg.from.country}`))),
      h('li', { class: 'it-flight' },
        icon('i-plane'),
        leg.minutes ? `≈ ${fmtDuration(leg.minutes)} flight` : 'Flight time unknown'),
      h('li', { class: 'it-stop' },
        h('time', {}, leg.arr ? `≈ ${leg.arr.time}` : '—', leg.arr?.nextDay && h('sup', {}, '+1')),
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
      WIZZ_BASIC.extra.map((item) => h('li', { class: 'is-extra' }, h('span', { class: 'rule-plus', 'aria-hidden': 'true' }, '+'), `${item} — extra`))));
}

function destinationFacts(info, site) {
  const { dest } = info;
  const diff = hoursBetween(site.origin.timeZone, dest.timeZone);
  const facts = [
    ['Local time now', dest.timeZone ? nowIn(dest.timeZone) : null],
    ['Time difference', diff == null ? null : diff === 0 ? 'Same as Chișinău' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} h vs Chișinău`],
    ['Distance', info.km ? `${info.km.toLocaleString('en-US')} km` : null],
    ['Flight time', info.minutes ? `≈ ${fmtDuration(info.minutes)}` : null],
    ['Local currency', dest.localCurrency],
    ['Airport', dest.airportName ?? null],
  ].filter(([, value]) => value);
  return h('section', { class: 'info-card' },
    h('h4', {}, `${flagEmoji(dest.countryCode)} About ${dest.name}`),
    h('dl', { class: 'facts' }, facts.map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', {}, value)))));
}

function priceBox({ trip, info, site, money, query }) {
  const url = bookingLink(trip, site, query.adults);
  const shareUrl = new URL(toHash({ ...query, to: trip.iata, depart: trip.outDate, back: trip.backDate }), location.href).href;
  return h('section', { class: 'price-box' },
    h('span', { class: trip.source === 'wizz' ? 'badge is-live' : 'badge is-cached' }, trip.source === 'wizz' ? 'Live price' : 'Recently seen price'),
    h('p', { class: 'pb-price' }, money.format(trip.pricePp), h('small', {}, 'per person, return')),
    query.adults > 1 && h('p', { class: 'pb-total' }, `${money.format(trip.pricePp * query.adults)} total for ${plural(query.adults, 'adult')}`),
    trip.outEur != null && h('p', { class: 'pb-split' }, `Outbound ${money.format(trip.outEur)} · Return ${money.format(trip.backEur)}`),
    url && h('a', { class: 'btn-primary btn-block', href: url, target: '_blank', rel: 'noopener noreferrer' }, bookLabel(trip), icon('i-external')),
    h('div', { class: 'pb-actions' },
      h('button', { type: 'button', class: 'btn-ghost', onclick: () => shareTrip({ dest: info.dest, trip, money, url: shareUrl }) }, icon('i-share'), 'Share'),
      h('button', { type: 'button', class: 'btn-ghost', onclick: () => downloadIcs({ dest: info.dest, trip, origin: site.origin, money, bookingUrl: url }) }, icon('i-calendar-plus'), 'Calendar')),
    h('p', { class: 'pb-note' }, trip.source === 'wizz'
      ? 'Wizz Air’s lowest fare when we last checked. Arrival times are estimated from distance.'
      : 'Seen by other travellers recently — confirm the price before booking.'));
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
    h('header', { class: 'dlg-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Flight details'),
        h('h2', { class: 'dlg-title' }, `${ORIGIN_NAMES[site.origin.iata] ?? site.origin.name} → ${info.dest.name}`),
        h('p', { class: 'dlg-sub' }, `${fmtDay(trip.outDate)} – ${fmtDay(trip.backDate)} · ${plural(trip.nights, 'night')} · ${plural(query.adults, 'adult')}`)),
      h('button', { type: 'button', class: 'dlg-close', 'aria-label': 'Close', onclick: () => dialog.close() }, '×')),
    h('div', { class: 'dlg-body' },
      h('div', { class: 'dlg-main' },
        photos[trip.iata] && h('figure', { class: 'dlg-photo' },
          photoImg(photos[trip.iata], { width: 720, height: 300, className: 'dlg-img', eager: true, alt: `${info.dest.name}, ${info.dest.country}` }),
          h('figcaption', {}, photoCredit(photos[trip.iata]))),
        itineraryLeg('Outbound', trip, info.out),
        itineraryLeg('Return', trip, info.back),
        fareRules(trip),
        destinationFacts(info, site),
        calendar && h('section', { class: 'info-card' }, h('h4', {}, 'Change dates — cheapest return by departure day'), calendar),
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
