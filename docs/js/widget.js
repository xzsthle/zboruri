// The Skyscanner-style search widget: From · To · Depart · Return · Travellers · Search.
// It edits a draft query; nothing changes until the viewer presses Search.

import { $, h, icon } from './dom.js';
import { matchesQuery } from './data.js';
import { departSpec } from './query.js';
import { fmtDay, fmtMonthLong, fmtShort, plural } from './format.js';
import { monthChips, priceCalendar, stayPresets, stepper, tabs } from './pickers.js';
import { photoImg } from './photo.js';

const DESTINATION_LIMIT = 8;

export function describeDepart(depart) {
  const spec = departSpec(depart);
  if (spec.type === 'range') return `${fmtShort(spec.from)} – ${fmtShort(spec.to)}`;
  if (spec.type === 'date') return fmtDay(spec.date);
  if (spec.type === 'month') {
    const [y, m] = spec.month.split('-').map(Number);
    return fmtMonthLong(y, m - 1);
  }
  return 'Anytime';
}

export const describeStay = (query) => (query.back ? fmtDay(query.back) : `${query.min}–${query.max} nights`);
export const describeTravellers = (adults) => plural(adults, 'adult');

export function createSearchWidget({ site, engine, getMoney, photos = {}, onSearch }) {
  const root = $('search-widget');
  const limits = { min: site.rules.minNights, max: site.rules.maxNights };
  const range = engine.dateRange() ?? { first: site.generatedAt.slice(0, 10), last: site.generatedAt.slice(0, 10) };
  let draft = null;
  let openName = null;
  let comboIndex = -1;

  const destName = (iata) => {
    if (iata === 'anywhere') return 'Everywhere';
    if (iata.includes(',')) return draft?.label || `${iata.split(',').length} destinations`;
    return engine.destinations.get(iata)?.name ?? iata;
  };

  // ---------- popovers ----------

  function closePopover() {
    openName = null;
    root.querySelectorAll('.sw-pop').forEach((pop) => { pop.hidden = true; });
    root.querySelectorAll('[aria-expanded="true"]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
  }

  function openPopover(name, mode = null) {
    closePopover();
    modes[name] = mode;
    openName = name;
    $(`sw-pop-${name}`).hidden = false;
    root.querySelector(`[data-pop="${name}"]`)?.setAttribute('aria-expanded', 'true');
    renderPopover(name);
  }

  function update(patch, { keepOpen = true } = {}) {
    draft = { ...draft, ...patch };
    renderFields();
    if (keepOpen && openName) renderPopover(openName);
  }

  // ---------- destination combobox ----------

  function destinationOptions(text) {
    const typed = text.trim() && text !== 'Everywhere' ? text : '';
    const matches = [...engine.destinations.values()].filter((dest) => matchesQuery(dest, typed))
      .toSorted((a, b) => (a.cheapest?.totalEur ?? Infinity) - (b.cheapest?.totalEur ?? Infinity))
      .slice(0, DESTINATION_LIMIT);
    return [{ iata: 'anywhere' }, ...matches];
  }

  function renderDestinations() {
    const options = destinationOptions($('sw-to').value);
    const money = getMoney();
    comboIndex = Math.min(comboIndex, options.length - 1);
    $('sw-pop-to').replaceChildren(h('ul', { class: 'combo-list', role: 'listbox', id: 'sw-to-list', 'aria-label': 'Destinations' },
      options.map((dest, i) => {
        const anywhere = dest.iata === 'anywhere';
        return h('li', {
          role: 'option', id: `sw-opt-${i}`, class: i === comboIndex ? 'combo-option is-active' : 'combo-option', 'aria-selected': String(i === comboIndex),
          onmousedown: (event) => { event.preventDefault(); chooseDestination(dest.iata); },
        },
          h('span', { class: 'combo-icon', 'aria-hidden': 'true' }, anywhere ? icon('i-globe') : photoImg(photos[dest.iata], { width: 40, height: 40, className: 'combo-photo', alt: '' }) ?? dest.countryCode),
          h('span', { class: 'combo-text' },
            h('strong', {}, anywhere ? 'Everywhere' : `${dest.name} (${dest.iata})`),
            h('span', {}, anywhere ? 'Explore every destination from Chișinău' : dest.airportName ?? dest.country)),
          !anywhere && dest.cheapest && h('span', { class: 'combo-price' }, `from ${money.format(dest.cheapest.totalEur)}`));
      })));
    $('sw-to').setAttribute('aria-activedescendant', comboIndex >= 0 ? `sw-opt-${comboIndex}` : '');
  }

  function chooseDestination(iata) {
    update({ to: iata, label: '' }, { keepOpen: false });
    $('sw-to').value = destName(iata); // renderFields skips the focused input, so set it here
    closePopover();
    root.querySelector('[data-pop="depart"]').focus();
  }

  function onComboKey(event) {
    const options = destinationOptions($('sw-to').value);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (openName !== 'to') openPopover('to');
      comboIndex = (comboIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      renderDestinations();
    } else if (event.key === 'Enter' && openName === 'to') {
      event.preventDefault();
      chooseDestination(options[Math.max(0, comboIndex)].iata);
    } else if (event.key === 'Escape') {
      closePopover();
      renderFields();
    }
  }

  // ---------- panels ----------

  // Which tab each popover shows; null means "follow the draft".
  const modes = { depart: null, back: null };
  const setMode = (name, mode) => { modes[name] = mode; renderPopover(name); };

  function departPanel() {
    const money = getMoney();
    const spec = departSpec(draft.depart);
    const mode = modes.depart ?? (spec.type === 'month' ? 'month' : 'date');
    const bodies = {
      date: () => priceCalendar({
        prices: engine.pricesByDepartDay({ ...draft, back: '' }), selected: spec.date ?? null, minDate: range.first, maxDate: range.last, money,
        onPick: (date) => { update({ depart: date, back: draft.back && draft.back <= date ? '' : draft.back }); openPopover('back', 'date'); },
      }),
      month: () => monthChips({
        prices: engine.pricesByMonth({ ...draft, back: '' }), selected: spec.month ?? null, money,
        onPick: (month) => { update({ depart: month, back: '' }); closePopover(); },
      }),
      anytime: () => h('div', { class: 'pop-empty' },
        h('p', {}, 'We’ll search every date and show you the cheapest.'),
        h('button', { type: 'button', class: 'btn-primary', onclick: () => { update({ depart: 'anytime', back: '' }); closePopover(); } }, 'Search anytime')),
    };
    return [tabs([['date', 'Specific date'], ['month', 'Whole month'], ['anytime', 'Anytime']], mode, (next) => setMode('depart', next)), bodies[mode]()];
  }

  function backPanel() {
    const money = getMoney();
    const spec = departSpec(draft.depart);
    const exactAllowed = spec.type === 'date';
    const mode = exactAllowed ? modes.back ?? (draft.back ? 'date' : 'nights') : 'nights';
    const nights = () => h('div', { class: 'pop-stack' },
      stayPresets({ min: draft.min, max: draft.max, limits, onPick: (min, max) => update({ min, max, back: '' }) }),
      stepper({ label: 'Shortest stay', hint: 'nights', value: draft.min, min: limits.min, max: draft.max, onChange: (min) => update({ min, back: '' }) }),
      stepper({ label: 'Longest stay', hint: 'nights', value: draft.max, min: draft.min, max: limits.max, onChange: (max) => update({ max, back: '' }) }),
      !exactAllowed && h('p', { class: 'pop-note' }, 'Pick a specific departure day to choose an exact return date.'));
    const exact = () => priceCalendar({
      prices: engine.pricesByReturnDay(draft, spec.date), selected: draft.back || null, rangeStart: spec.date,
      minDate: spec.date, maxDate: range.last, money, onPick: (date) => { update({ back: date }); closePopover(); },
    });
    return [
      tabs([['nights', 'Trip length'], ['date', 'Specific return date', !exactAllowed]], mode, (next) => {
        if (next === 'nights') update({ back: '' });
        setMode('back', next);
      }),
      mode === 'date' ? exact() : nights(),
    ];
  }

  function travellersPanel() {
    return [
      stepper({ label: 'Adults', hint: 'Age 16+', value: draft.adults, min: 1, max: 9, onChange: (adults) => update({ adults }) }),
      h('p', { class: 'pop-note' }, 'Prices are shown per person, with the total for everyone travelling.'),
      h('button', { type: 'button', class: 'btn-primary pop-done', onclick: closePopover }, 'Done'),
    ];
  }

  function renderPopoverWith(name, children) {
    $(`sw-pop-${name}`).replaceChildren(h('div', { class: 'pop-inner' }, children.filter(Boolean)));
  }

  function renderPopover(name) {
    if (name === 'to') renderDestinations();
    else if (name === 'depart') renderPopoverWith(name, departPanel());
    else if (name === 'back') renderPopoverWith(name, backPanel());
    else if (name === 'pax') renderPopoverWith(name, travellersPanel());
  }

  // ---------- fields ----------

  // ---------- phone summary pill (search view): the whole form folds into one line ----------

  const summary = root.querySelector('.sw-summary');
  const setExpanded = (expanded) => {
    root.closest('.hero-search').classList.toggle('is-expanded', expanded);
    summary.setAttribute('aria-expanded', String(expanded));
    summary.querySelector('.sw-summary-orb use').setAttribute('href', expanded ? '#i-close' : '#i-edit');
  };
  summary.addEventListener('click', () => setExpanded(summary.getAttribute('aria-expanded') !== 'true'));

  function renderFields() {
    summary.querySelector('.sw-summary-text').textContent =
      [destName(draft.to), describeDepart(draft.depart), describeStay(draft), describeTravellers(draft.adults)].join(' · ');
    summary.setAttribute('aria-label', `Edit search: ${summary.querySelector('.sw-summary-text').textContent}`);
    if (document.activeElement !== $('sw-to')) $('sw-to').value = destName(draft.to);
    $('sw-depart-value').textContent = describeDepart(draft.depart);
    $('sw-back-value').textContent = describeStay(draft);
    $('sw-pax-value').textContent = describeTravellers(draft.adults);
    $('sw-others').checked = draft.others;
  }

  root.querySelectorAll('[data-pop]').forEach((field) => {
    if (field.id === 'sw-to') return;
    field.addEventListener('click', () => (openName === field.dataset.pop ? closePopover() : openPopover(field.dataset.pop)));
  });
  $('sw-to').addEventListener('focus', () => { $('sw-to').select(); comboIndex = -1; openPopover('to'); });
  // Typing highlights the first matching city (index 1), so Enter picks it rather than "Everywhere".
  $('sw-to').addEventListener('input', () => { comboIndex = $('sw-to').value.trim() ? 1 : 0; if (openName !== 'to') openPopover('to'); else renderDestinations(); });
  $('sw-to').addEventListener('keydown', onComboKey);
  $('sw-to').addEventListener('blur', () => setTimeout(() => { if (openName === 'to') { closePopover(); renderFields(); } }, 120));
  $('sw-others').addEventListener('change', (event) => update({ others: event.target.checked }));
  document.addEventListener('pointerdown', (event) => { if (openName && !root.contains(event.target)) closePopover(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && openName) closePopover(); });
  // A manual search replaces whatever the "Ask" box said.
  root.addEventListener('submit', (event) => { event.preventDefault(); closePopover(); onSearch({ ...draft, note: '' }); });

  return {
    setQuery(query) {
      draft = { ...query };
      setExpanded(false); // a new search folds the phone form back into its summary
      renderFields();
    },
  };
}
