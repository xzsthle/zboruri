// Page chrome: hero copy, live status, month tabs, footer notes and the side-rail scroll highlight.

import { $, h } from './dom.js';
import { monthCounts } from './data.js';
import { fmtAgo, fmtEur, fmtMonth, ORIGIN_NAMES, plural } from './format.js';

export function renderChrome(data, deals) {
  const { rules } = data;
  const origin = ORIGIN_NAMES[data.origin.iata] ?? data.origin.name;
  const destinationsWithDeals = data.destinations.filter((d) => d.deals.length > 0).length;

  $('limit').textContent = fmtEur(rules.maxReturnPriceEur);
  $('hero-sub').textContent =
    `All ${data.destinations.length} Wizz Air routes from ${origin}, checked each morning and evening ` +
    `for ${rules.minNights}–${rules.maxNights} night return trips.`;
  $('hero-when').textContent = `Next ${rules.daysAhead} days`;
  $('hero-cta').textContent = destinationsWithDeals > 0 ? `Show ${plural(destinationsWithDeals, 'deal')}` : 'See routes';
  $('step-routes').textContent = `Scans all ${data.destinations.length} routes`;
  $('step-trips-text').textContent =
    `Every ${rules.minNights}–${rules.maxNights} night out-and-back combination is priced in euros and kept if it’s ` +
    `${fmtEur(rules.maxReturnPriceEur)} or less.`;
  $('status-updated').replaceChildren(
    h('time', { datetime: data.generatedAt, title: new Date(data.generatedAt).toLocaleString() }, `Updated ${fmtAgo(data.generatedAt)}`),
  );

  const failed = data.failed ?? [];
  $('failed').hidden = failed.length === 0;
  $('failed').textContent = failed.length > 0 ? `Couldn’t check on the last run: ${failed.join(', ')}.` : '';
}

export function renderMonths(data, deals, active, onChange) {
  const year = new Date(data.generatedAt).getUTCFullYear();
  const tabs = [[null, 'All', deals.length], ...monthCounts(deals).map(([month, count]) => [month, fmtMonth(month, year), count])];
  $('months').replaceChildren(...tabs.map(([month, label, count]) =>
    h('button', { class: 'tab', type: 'button', 'aria-pressed': String(month === active), onclick: () => onChange(month) },
      label, h('span', { class: 'tab-count' }, String(count)))));
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
