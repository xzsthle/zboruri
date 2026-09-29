// "Cheapest right now": a carousel of destination cards (the selected one grows, turns dark and the
// plane breaks out of it) plus a detail panel with every date option for that destination.

import { $, h, icon, prefersReducedMotion, s } from './dom.js';
import { cardTheme } from './art.js';
import { dealScore, flagEmoji, fmtDay, fmtEur, fmtLeg, fmtShort, plural, safeBookingUrl } from './format.js';

let renderedKey = null;

const dots = (count) =>
  h('span', { class: 'dots', 'aria-hidden': 'true' },
    Array.from({ length: 5 }, (_, i) => h('span', { class: i < count ? 'dot is-on' : 'dot' })));

function dealCard([{ dest, trip }], limit, onSelect) {
  const theme = cardTheme(dest.iata);
  return h('button', {
    class: 'deal-card',
    type: 'button',
    'data-iata': dest.iata,
    'aria-pressed': 'false',
    'aria-label': `${dest.name}, ${dest.country}: ${fmtEur(trip.totalEur)} return, ${plural(trip.nights, 'night')} from ${fmtDay(trip.outDate)}`,
    style: { '--card-bg': theme.bg, '--card-on': theme.on, '--card-glow': theme.glow },
    onclick: () => onSelect(dest.iata),
  },
    h('span', { class: 'deal-flag', 'aria-hidden': 'true' }, flagEmoji(dest.countryCode)),
    h('span', { class: 'deal-code' }, dest.iata),
    h('span', { class: 'deal-city' }, dest.name),
    h('span', { class: 'deal-meta' }, `${plural(trip.nights, 'night')} · ${fmtShort(trip.outDate)}`),
    h('span', { class: 'deal-foot' },
      dots(dealScore(trip.totalEur, limit).dots),
      h('span', { class: 'deal-price' }, fmtEur(trip.totalEur)),
    ),
    s('svg', { class: 'deal-plane', viewBox: '0 0 560 170', 'aria-hidden': 'true' }, s('use', { href: '#plane-art' })),
  );
}

function emptyCard(message) {
  return h('div', { class: 'deal-empty' }, icon('i-search', 'icon deal-empty-icon'), h('p', {}, message));
}

function bookLink(url, className, label, srText) {
  return url && h('a', { class: className, href: url, target: '_blank', rel: 'noopener noreferrer' },
    label, h('span', { class: 'sr-only' }, srText), icon('i-external'));
}

function dateOption({ dest, trip }, isBest) {
  return h('li', { class: isBest ? 'date-option is-best' : 'date-option' },
    h('span', { class: 'date-range' }, `${fmtDay(trip.outDate)} → ${fmtDay(trip.backDate)}`),
    h('span', { class: 'date-nights' }, plural(trip.nights, 'night')),
    h('span', { class: 'date-price' }, fmtEur(trip.totalEur)),
    bookLink(safeBookingUrl(trip.bookingUrl), 'date-book', '', `Book ${dest.name}, ${fmtDay(trip.outDate)} to ${fmtDay(trip.backDate)}, on Wizz Air`),
  );
}

function detailView(group, limit) {
  const [{ dest, trip }] = group;
  const score = dealScore(trip.totalEur, limit);
  const saved = Math.round(limit - trip.totalEur);
  return [
    h('div', { class: 'detail-head' },
      h('span', { class: 'detail-badge', 'aria-hidden': 'true' }, flagEmoji(dest.countryCode)),
      h('div', { class: 'detail-titles' },
        h('h3', { class: 'detail-title' }, dest.name),
        h('p', { class: 'detail-sub' }, `${dest.country} · ${dest.iata}`),
      ),
      h('div', { class: 'detail-score' }, dots(score.dots), h('span', {}, score.label)),
      h('span', { class: 'detail-count' }, plural(group.length, 'date option')),
    ),
    h('p', { class: 'detail-text' },
      `Fly out ${fmtLeg(trip.outDate, trip.outTimes)} and back ${fmtLeg(trip.backDate, trip.backTimes)} — ` +
        `${plural(trip.nights, 'night')} in ${dest.name} for ${fmtEur(trip.totalEur)} return` +
        `${saved >= 1 ? `, ${fmtEur(saved)} under your limit` : ''}.`),
    h('div', { class: 'detail-body' },
      h('ul', { class: 'date-list' }, group.map((deal, i) => dateOption(deal, i === 0))),
      h('div', { class: 'detail-cta' },
        h('p', { class: 'detail-price' }, fmtEur(trip.totalEur), h('small', {}, 'return')),
        bookLink(safeBookingUrl(trip.bookingUrl), 'btn-primary', 'Book on Wizz Air', ` — ${dest.name}, best dates`),
      ),
    ),
  ];
}

export function renderShowcase({ data, groups, selected, emptyMessage, onSelect }) {
  const limit = data.rules.maxReturnPriceEur;
  const track = $('carousel');
  const key = groups.map(([first]) => `${first.dest.iata}:${first.trip.totalEur}`).join('|');
  if (key !== renderedKey) {
    renderedKey = key;
    track.replaceChildren(...(groups.length > 0 ? groups.map((group) => dealCard(group, limit, onSelect)) : [emptyCard(emptyMessage)]));
  }

  const selectedIata = selected?.[0].dest.iata;
  track.querySelectorAll('.deal-card').forEach((card) => {
    card.setAttribute('aria-pressed', String(card.dataset.iata === selectedIata));
  });

  $('showcase-meta').textContent = groups.length > 0
    ? `${plural(groups.length, 'destination')} under ${fmtEur(limit)} return · tap a card for dates`
    : `Nothing under ${fmtEur(limit)} for this filter`;
  $('detail').hidden = !selected;
  $('detail').replaceChildren(...(selected ? detailView(selected, limit) : []));
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
