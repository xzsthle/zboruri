// Page chrome: hero copy, live status, data sources, footer notes and the side-rail scroll highlight.

import { $, h } from './dom.js';
import { fmtAgo, fmtNextScan, ORIGIN_NAMES, plural } from './format.js';

export function renderChrome(data, deals, money) {
  const { rules } = data;
  const origin = ORIGIN_NAMES[data.origin.iata] ?? data.origin.name;
  const destinationsWithDeals = new Set(deals.map(({ dest }) => dest.iata)).size;
  const otherAirlines = data.sources?.some((source) => source.id === 'travelpayouts');

  $('limit').textContent = money.format(rules.maxReturnPriceEur);
  $('hero-eyebrow').textContent = otherAirlines ? 'Every airline · checked twice a day' : 'Wizz Air · checked twice a day';
  $('hero-sub').textContent =
    `All ${data.destinations.length} routes from ${origin}, checked each morning and evening ` +
    `for ${rules.minNights}–${rules.maxNights} night return trips in the next ${rules.daysAhead} days.`;
  $('hero-when').textContent = `Next ${rules.daysAhead} days`;
  $('hero-cta').textContent = destinationsWithDeals > 0 ? `Show ${plural(destinationsWithDeals, 'deal')}` : 'See routes';
  $('step-trips-text').textContent =
    `Every ${rules.minNights}–${rules.maxNights} night out-and-back combination is priced and kept if it’s ` +
    `${money.format(rules.maxReturnPriceEur)} or less.`;
  $('sources-note').textContent = otherAirlines
    ? 'Live fares from Wizz Air; other airlines via Aviasales (recently seen prices — check before booking).'
    : 'Live fares from Wizz Air. Other airlines switch on once a Travelpayouts token is added.';

  $('status-updated').replaceChildren(
    h('time', { datetime: data.generatedAt, title: new Date(data.generatedAt).toLocaleString() }, `Updated ${fmtAgo(data.generatedAt)}`));
  $('status-next').textContent = `Next check ${fmtNextScan()}`;

  const failed = data.failed ?? [];
  $('failed').hidden = failed.length === 0;
  $('failed').textContent = failed.length > 0 ? `Couldn’t check on the last run: ${failed.join(', ')}.` : '';
}

/** Highlights the rail link for the section crossing the middle of the viewport. */
export function initRail() {
  const links = [...document.querySelectorAll('.rail-link')];
  const visible = new Set();
  const update = () => {
    const active = links.find((link) => visible.has(link.dataset.spy)) ?? links[0];
    links.forEach((link) => link.toggleAttribute('aria-current', link === active));
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visible.add(entry.target.dataset.section);
      else visible.delete(entry.target.dataset.section);
    });
    update();
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('[data-section]').forEach((section) => observer.observe(section));
  update();
}
