// "Cheapest right now": the destination carousel (the selected card grows, turns dark and the plane
// breaks out of it) plus a detail panel with dates, actions, fare calendar and price history.

import { $, h, icon, prefersReducedMotion, s } from './dom.js';
import { cardTheme } from './art.js';
import { downloadIcs, shareDeal } from './actions.js';
import { fareCalendar } from './calendar.js';
import { priceHistory } from './history-chart.js';
import { dealScore, flagEmoji, fmtDay, fmtLeg, fmtShort, plural, safeBookingUrl } from './format.js';

let renderedKey = null;

const dots = (count) =>
  h('span', { class: 'dots', 'aria-hidden': 'true' },
    Array.from({ length: 5 }, (_, i) => h('span', { class: i < count ? 'dot is-on' : 'dot' })));

const isCached = (trip) => trip.source === 'travelpayouts';
const bookLabel = (trip) => (isCached(trip) ? 'Check on Aviasales' : `Book on ${trip.airline}`);

function dealCard([{ dest, trip }], { limit, money, onSelect }) {
  const theme = cardTheme(dest.iata);
  return h('button', {
    class: 'deal-card',
    type: 'button',
    'data-iata': dest.iata,
    'aria-pressed': 'false',
    'aria-label': `${dest.name}, ${dest.country}: ${money.format(trip.totalEur)} return with ${trip.airline}, ${plural(trip.nights, 'night')} from ${fmtDay(trip.outDate)}`,
    style: { '--card-bg': theme.bg, '--card-on': theme.on, '--card-glow': theme.glow },
    onclick: () => onSelect(dest.iata),
  },
    h('span', { class: 'deal-top' },
      h('span', { class: 'deal-flag', 'aria-hidden': 'true' }, flagEmoji(dest.countryCode)),
      h('span', { class: 'deal-badge' }, trip.airline)),
    h('span', { class: 'deal-code' }, dest.iata),
    h('span', { class: 'deal-city' }, dest.name),
    h('span', { class: 'deal-meta' }, `${plural(trip.nights, 'night')} · ${fmtShort(trip.outDate)}`),
    h('span', {}),
    h('span', { class: 'deal-foot' }, dots(dealScore(trip.totalEur, limit).dots), h('span', { class: 'deal-price' }, money.format(trip.totalEur))),
    s('svg', { class: 'deal-plane', viewBox: '0 0 560 170', 'aria-hidden': 'true' }, s('use', { href: '#plane-art' })));
}

function bookLink(trip, className, label, srText) {
  const url = safeBookingUrl(trip.bookingUrl);
  return url && h('a', { class: className, href: url, target: '_blank', rel: 'noopener noreferrer' },
    label, h('span', { class: 'sr-only' }, srText), icon('i-external'));
}

function dateOption({ dest, trip }, isBest, money) {
  const stops = trip.stops > 0 ? ` · ${plural(trip.stops, 'stop')}` : '';
  return h('li', { class: isBest ? 'date-option is-best' : 'date-option' },
    h('span', { class: 'date-range' }, `${fmtDay(trip.outDate)} → ${fmtDay(trip.backDate)}`),
    h('span', { class: 'date-meta' }, `${plural(trip.nights, 'night')} · ${trip.airline}${stops}`),
    h('span', { class: 'date-price' }, money.format(trip.totalEur)),
    bookLink(trip, 'date-book', '', `${bookLabel(trip)}: ${dest.name}, ${fmtDay(trip.outDate)} to ${fmtDay(trip.backDate)}`));
}

function detailHead(group, limit) {
  const [{ dest, trip }] = group;
  const airlines = [...new Set(group.map((deal) => deal.trip.airline))];
  const cached = group.some((deal) => isCached(deal.trip));
  return h('div', { class: 'detail-head' },
    h('span', { class: 'detail-badge', 'aria-hidden': 'true' }, flagEmoji(dest.countryCode)),
    h('div', {}, h('h3', { class: 'detail-title' }, dest.name), h('p', { class: 'detail-sub' }, `${dest.country} · ${dest.iata} · ${plural(group.length, 'date option')}`)),
    h('div', { class: 'detail-score' }, dots(dealScore(trip.totalEur, limit).dots), h('span', {}, dealScore(trip.totalEur, limit).label)),
    h('div', { class: 'detail-tags' },
      airlines.map((name) => h('span', { class: 'tag' }, name)),
      h('span', { class: cached ? 'tag is-cached' : 'tag is-live' }, cached ? 'Includes cached fares' : 'Live fares')));
}

function detailView(group, { data, money, history }) {
  const limit = data.rules.maxReturnPriceEur;
  const [{ dest, trip }] = group;
  const saved = limit - trip.totalEur;
  return [
    detailHead(group, limit),
    h('p', { class: 'detail-text' },
      `Fly out ${fmtLeg(trip.outDate, trip.outTimes)} and back ${fmtLeg(trip.backDate, trip.backTimes)} with ${trip.airline} — ` +
        `${plural(trip.nights, 'night')} in ${dest.name} for ${money.format(trip.totalEur)} return` +
        `${saved >= 1 ? `, ${money.format(saved)} under your limit` : ''}.${isCached(trip) ? ' This price was seen recently — check it before booking.' : ''}`),
    h('div', { class: 'detail-body' },
      h('ul', { class: 'date-list' }, group.map((deal, i) => dateOption(deal, i === 0, money))),
      h('div', { class: 'detail-cta' },
        h('p', { class: 'detail-price' }, money.format(trip.totalEur), h('small', {}, 'return')),
        h('div', { class: 'detail-actions' },
          h('button', { class: 'btn-ghost', type: 'button', onclick: () => shareDeal({ dest, trip, money }) }, icon('i-share'), 'Share'),
          h('button', { class: 'btn-ghost', type: 'button', onclick: () => downloadIcs({ dest, trip, origin: data.origin, money }) }, icon('i-calendar-plus'), 'Add to calendar'),
          bookLink(trip, 'btn-primary', bookLabel(trip), ` — ${dest.name}, best dates`)))),
    h('div', { class: 'detail-insights' },
      fareCalendar({ dest, limit, money, selectedOut: trip.outDate }) ?? h('p', { class: 'history-note' }, 'The fare calendar appears after the next scan.'),
      priceHistory({ points: history[dest.iata], current: dest.cheapest?.totalEur ?? trip.totalEur, money })),
  ];
}

export function renderShowcase({ data, groups, selected, money, history, emptyMessage, onSelect }) {
  const limit = data.rules.maxReturnPriceEur;
  const track = $('carousel');
  const key = `${money.code}#${groups.map(([first]) => `${first.dest.iata}:${first.trip.totalEur}:${first.trip.outDate}`).join('|')}`;
  if (key !== renderedKey) {
    renderedKey = key;
    track.replaceChildren(...(groups.length > 0
      ? groups.map((group) => dealCard(group, { limit, money, onSelect }))
      : [h('div', { class: 'deal-empty' }, icon('i-search'), h('p', {}, emptyMessage))]));
  }
  const selectedIata = selected?.[0].dest.iata;
  track.querySelectorAll('.deal-card').forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.iata === selectedIata)));

  $('showcase-meta').textContent = groups.length > 0
    ? `${plural(groups.length, 'destination')} under ${money.format(limit)} return · tap a card for dates, calendar and price history`
    : `Nothing under ${money.format(limit)} for these filters`;
  $('detail').hidden = !selected;
  $('detail').replaceChildren(...(selected ? detailView(selected, { data, money, history }) : []));
}

export function centerSelectedCard() {
  $('carousel').querySelector('[aria-pressed="true"]')?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'nearest',
    inline: 'center',
  });
}

export function initCarouselNav() {
  const track = $('carousel');
  const step = (direction) => track.scrollBy({ left: direction * track.clientWidth * 0.6, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  $('carousel-prev').addEventListener('click', () => step(-1));
  $('carousel-next').addEventListener('click', () => step(1));
}
