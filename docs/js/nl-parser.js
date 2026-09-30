// Instant, offline understanding of typed requests in English and Romanian, e.g.
//   "beach next week under €80" · "zbor la mare săptămâna viitoare sub 1500 lei" · "weekend în Italia pentru 2"
// Produces the same intent shape as the Gemini endpoint (see intent.js).

import { DESTINATION_THEMES, ENGLISH_HINTS, MONTH_WORDS, PLACE_ALIASES, ROMANIAN_HINTS, THEME_LABELS, THEME_WORDS } from './themes.js';

const DAY_MS = 86_400_000;
const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date, n) => iso(dayMs(date) + n * DAY_MS);
const weekday = (date) => new Date(dayMs(date)).getUTCDay(); // 0 = Sunday
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = (phrase) => new RegExp(`(^| )${escapeRe(phrase)}(?= |$)`);
const has = (text, phrase) => phraseRe(phrase).test(text);
const hasAny = (text, phrases) => phrases.some((p) => has(text, p));
const remove = (text, phrase) => text.replace(phraseRe(phrase), ' ').replace(/\s+/g, ' ');

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, unu: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5 };
// Month words that are also everyday words ("mai ieftin", "may I", "noi" = we) need a date-like context.
const AMBIGUOUS_MONTHS = new Set(['mai', 'may', 'mar', 'march', 'noi', 'sept', 'aug']);
// City names that are also everyday English words only count when written with a capital letter.
const AMBIGUOUS_CITIES = { nice: /\bNice\b/ };

function detectLanguage(original, text) {
  if (/[ăâîșşțţ]/i.test(original)) return 'ro';
  const words = text.split(' ');
  const count = (list) => words.filter((w) => list.includes(w)).length;
  const aliasWords = Object.keys(PLACE_ALIASES).filter((w) => !['uk', 'england'].includes(w));
  const ro = count(ROMANIAN_HINTS) + count(aliasWords);
  const en = count(ENGLISH_HINTS);
  return ro > en ? 'ro' : 'en';
}

// ---------- dates ----------

function nextMonthStart(today, monthIndex) {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const year = monthIndex >= m ? y : y + 1;
  return { year, month: monthIndex };
}

function monthRange({ year, month }, today) {
  const from = `${year}-${pad(month + 1)}-01`;
  return { from: from < today ? today : from, to: `${year}-${pad(month + 1)}-${pad(lastDay(year, month))}`, kind: 'month', month };
}

/** Weekend departures run Thursday to Saturday; on Sunday "this weekend" means the coming one. */
function weekendOf(today, weeksAhead) {
  const day = weekday(today);
  const thursday = addDays(addDays(today, day === 0 ? 4 : 4 - day), 7 * weeksAhead);
  return { from: thursday < today ? today : thursday, to: addDays(thursday, 2) };
}

function nextMonday(today) {
  return addDays(today, ((8 - weekday(today)) % 7) || 7);
}

function explicitDay(text, today) {
  for (const [index, words] of MONTH_WORDS.entries()) {
    for (const word of words) {
      const match = new RegExp(`(^| )(\\d{1,2}) ${escapeRe(word)}(?= |$)`).exec(text);
      if (!match) continue;
      const day = Number(match[2]);
      const { year, month } = nextMonthStart(today, index);
      if (day < 1 || day > lastDay(year, month)) continue;
      let date = `${year}-${pad(month + 1)}-${pad(day)}`;
      if (date < today) date = `${year + 1}-${pad(month + 1)}-${pad(day)}`;
      return { from: date, to: date, kind: 'day', phrase: match[0].trim() };
    }
  }
  return null;
}

function monthWord(text, today) {
  for (const [index, words] of MONTH_WORDS.entries()) {
    for (const word of words) {
      const plain = has(text, word) && !AMBIGUOUS_MONTHS.has(word);
      const contextual = hasAny(text, ['in', 'on', 'din', 'de', 'during', 'pe'].map((p) => `${p} ${word}`));
      if (plain || contextual) return { ...monthRange(nextMonthStart(today, index), today), phrase: word };
    }
  }
  return null;
}

const DATE_RULES = [
  { words: ['revelion', 'new year', 'new years', 'anul nou'], range: (t) => ({ from: `${t.slice(0, 4)}-12-28`, to: `${Number(t.slice(0, 4)) + 1}-01-02`, kind: 'newyear' }) },
  { words: ['christmas', 'craciun'], range: (t) => ({ from: `${t.slice(0, 4)}-12-19`, to: `${t.slice(0, 4)}-12-26`, kind: 'christmas' }) },
  { words: ['next weekend', 'weekendul viitor', 'weekend ul viitor', 'weekendul urmator'], range: (t) => ({ ...weekendOf(t, 1), kind: 'nextweekend', weekend: true }) },
  { words: ['this weekend', 'weekendul asta', 'weekendul acesta', 'weekend ul asta', 'in weekend'], range: (t) => ({ ...weekendOf(t, 0), kind: 'weekend', weekend: true }) },
  { words: ['next week', 'saptamana viitoare', 'saptamana urmatoare', 'saptamana care vine'], range: (t) => ({ from: nextMonday(t), to: addDays(nextMonday(t), 6), kind: 'nextweek' }) },
  { words: ['this week', 'saptamana asta', 'saptamana aceasta'], range: (t) => ({ from: t, to: addDays(t, (7 - weekday(t)) % 7), kind: 'thisweek' }) },
  { words: ['day after tomorrow', 'poimaine'], range: (t) => ({ from: addDays(t, 2), to: addDays(t, 2), kind: 'day' }) },
  { words: ['tomorrow', 'maine'], range: (t) => ({ from: addDays(t, 1), to: addDays(t, 1), kind: 'tomorrow' }) },
  { words: ['today', 'tonight', 'azi', 'astazi', 'diseara'], range: (t) => ({ from: t, to: t, kind: 'today' }) },
  { words: ['next month', 'luna viitoare', 'luna urmatoare'], range: (t) => monthRange(nextMonthStart(t, (Number(t.slice(5, 7))) % 12), t) },
  { words: ['this month', 'luna asta', 'luna aceasta'], range: (t) => monthRange(nextMonthStart(t, Number(t.slice(5, 7)) - 1), t) },
];

function parseDates(text, today) {
  for (const rule of DATE_RULES) {
    const phrase = rule.words.find((w) => has(text, w));
    if (phrase) return { ...rule.range(today), phrase };
  }
  const offset = /(^| )(?:in|peste) (\d{1,3}) (days?|zile|weeks?|saptamani)(?= |$)/.exec(text);
  if (offset) {
    const n = Number(offset[2]);
    const start = addDays(today, /week|saptam/.test(offset[3]) ? 7 * n : n);
    return /week|saptam/.test(offset[3])
      ? { from: start, to: addDays(start, 6), kind: 'range', phrase: offset[0].trim() }
      : { from: start, to: start, kind: 'day', phrase: offset[0].trim() };
  }
  return explicitDay(text, today) ?? monthWord(text, today);
}

// ---------- stay, budget, travellers, sort ----------

function parseStay(text) {
  if (hasAny(text, ['long weekend', 'weekend prelungit'])) return { min: 3, max: 4, weekend: true };
  const nightsMatch = /(^| )(\d{1,2}) (nights?|nopti|noapte|nopți)(?= |$)/.exec(text);
  if (nightsMatch) return { min: Number(nightsMatch[2]), max: Number(nightsMatch[2]) };
  const daysMatch = /(^| )(?<!in |peste )(\d{1,2}) (days?|zile|zi)(?= |$)/.exec(text);
  if (daysMatch) return { min: Math.max(1, Number(daysMatch[2]) - 1), max: Math.max(1, Number(daysMatch[2]) - 1) };
  if (hasAny(text, ['a week', 'one week', '1 week', 'o saptamana', 'o saptamina', '1 saptamana', 'week long', 'for a week'])) return { min: 6, max: 8 };
  if (hasAny(text, ['short trip', 'scurt', 'scurta'])) return { min: 2, max: 3 };
  return null;
}

const CURRENCY_OF = { lei: 'MDL', mdl: 'MDL', leu: 'MDL', ron: 'RON', usd: 'USD', $: 'USD', dolari: 'USD', dollars: 'USD' };

function parseBudget(folded, rates) {
  const withLimit = /(?:under|below|less than|max(?:imum)?|up to|sub|maxim|pana la|mai putin de|cel mult|budget|buget|<)\s*(€|\$)?\s*(\d+(?:[.,]\d+)?)\s*(€|eur|euro|euros|lei|leu|mdl|ron|usd|\$|dolari|dollars)?/.exec(folded);
  const bare = /(\d+(?:[.,]\d+)?)\s*(€|eur|euro|euros|lei|mdl|ron)(?![a-z])/.exec(folded);
  const match = withLimit ?? (bare && [bare[0], null, bare[1], bare[2]]);
  if (!match) return { eur: 0 };
  const amount = Number(String(match[2]).replace(',', '.'));
  const code = CURRENCY_OF[match[3] ?? match[1]] ?? 'EUR';
  const rate = code === 'EUR' ? 1 : rates?.[code];
  return Number.isFinite(amount) && rate ? { eur: Math.round(amount / rate), amount, code } : { eur: 0 };
}

function parseAdults(text) {
  if (hasAny(text, ['two of us', 'noi doi', 'noi doua', 'amandoi', 'amandoua', 'couple', 'cuplu', 'for two', 'pentru doi', 'pentru doua'])) return 2;
  const counted = /(^| )(\d|one|two|three|four|five|unu|doi|doua|trei|patru|cinci) (people|persons|person|adults|adult|pax|persoane|persoana|adulti|oameni)(?= |$)/.exec(text);
  if (counted) return NUMBER_WORDS[counted[2]] ?? Number(counted[2]);
  const forN = /(^| )(?:for|pentru) (\d)(?! (?:days?|nights?|zile|nopti|weeks?))(?= |$)/.exec(text);
  if (forN) return Number(forN[2]);
  return 0;
}

function parseSort(text) {
  if (hasAny(text, ['cheapest', 'cheap', 'lowest', 'low cost', 'ieftin', 'ieftina', 'ieftine', 'ieftini', 'cel mai ieftin', 'cele mai ieftine'])) return 'cheapest';
  if (hasAny(text, ['soonest', 'asap', 'as soon as possible', 'cat mai repede', 'urgent'])) return 'soonest';
  return 'best';
}

// ---------- places and themes ----------

function applyAliases(text) {
  return Object.entries(PLACE_ALIASES).reduce((acc, [alias, name]) => acc.replace(phraseRe(alias), ` ${name}`), text);
}

/** English place name → the alias the person actually typed, e.g. "italy" → "Italia". */
function typedAliases(text) {
  return Object.fromEntries(Object.entries(PLACE_ALIASES).filter(([alias]) => has(text, alias))
    .map(([alias, name]) => [name, alias.replace(/(^| )\p{L}/gu, (c) => c.toUpperCase())]));
}

function matchPlaces(text, original, destinations, typed = {}) {
  const codes = new Set((original.match(/\b[A-Z]{3}\b/g) ?? []));
  const names = [];
  const hits = destinations.filter((dest) => {
    const full = fold(dest.name);
    const city = fold(dest.name.split(/[/(]/)[0]).trim().split(' ')[0];
    const country = fold(dest.country ?? '');
    const plainWord = AMBIGUOUS_CITIES[city];
    const byName = (has(text, full) || (city.length > 3 && has(text, city))) && (!plainWord || plainWord.test(original));
    const byCountry = country && has(text, country);
    const cityName = dest.name.split(/[/(]/)[0].trim().split(' ')[0];
    if (byName) names.push(typed[fold(cityName)] ?? cityName);
    if (byCountry && !byName) names.push(typed[country] ?? dest.country);
    return byName || byCountry || codes.has(dest.iata);
  });
  return { iatas: hits.map((d) => d.iata), names: [...new Set(names)] };
}

function matchThemes(text) {
  return Object.entries(THEME_WORDS).filter(([, words]) => hasAny(text, words)).map(([theme]) => theme);
}

function themedDestinations(themes, destinations) {
  if (themes.length === 0) return [];
  const tagged = (dest) => DESTINATION_THEMES[dest.iata] ?? [];
  const all = destinations.filter((dest) => themes.every((t) => tagged(dest).includes(t)));
  const any = destinations.filter((dest) => themes.some((t) => tagged(dest).includes(t)));
  return (all.length ? all : any).map((dest) => dest.iata);
}

// ---------- reply ----------

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const WHEN = {
  en: { nextweek: 'next week', thisweek: 'this week', weekend: 'this weekend', nextweekend: 'next weekend', tomorrow: 'tomorrow', today: 'today', christmas: 'around Christmas', newyear: 'for New Year' },
  ro: { nextweek: 'săptămâna viitoare', thisweek: 'săptămâna aceasta', weekend: 'weekendul acesta', nextweekend: 'weekendul viitor', tomorrow: 'mâine', today: 'azi', christmas: 'de Crăciun', newyear: 'de Revelion' },
};

function whenText(dates, lang) {
  if (!dates) return '';
  if (dates.kind === 'month') return lang === 'ro' ? `în ${MONTHS_RO[dates.month]}` : `in ${MONTHS_EN[dates.month]}`;
  if (WHEN[lang][dates.kind]) return WHEN[lang][dates.kind];
  const [, m, d] = dates.from.split('-').map(Number);
  return lang === 'ro' ? `pe ${d} ${MONTHS_RO[m - 1]}` : `on ${d} ${MONTHS_EN[m - 1]}`;
}

const CURRENCY_TEXT = { MDL: 'lei', RON: 'RON', USD: 'USD' };

/** "€80", "80 €" or the amount as typed ("1500 lei"). */
function budgetText({ eur, amount, code }, lang) {
  if (code && code !== 'EUR') return `${amount} ${CURRENCY_TEXT[code]}`;
  return lang === 'ro' ? `${eur} €` : `€${eur}`;
}

function buildReply(parts, lang) {
  const t = lang === 'ro'
    ? { none: 'Nu am înțeles detaliile — încearcă „la mare săptămâna viitoare sub 80 €”.', start: 'Caut', everywhere: 'toate destinațiile', under: (p) => `sub ${p}`, nights: (a, b) => (a === b ? `${a} nopți` : `${a}–${b} nopți`), adults: (n) => `pentru ${n} persoane`, weekend: 'doar weekenduri', cheapest: 'cele mai ieftine întâi' }
    : { none: 'I didn’t catch the details — try “beach next week under €80”.', start: 'Searching', everywhere: 'every destination', under: (p) => `under ${p}`, nights: (a, b) => (a === b ? `${a} nights` : `${a}–${b} nights`), adults: (n) => `for ${n} people`, weekend: 'weekends only', cheapest: 'cheapest first' };
  if (!parts.understood) return t.none;
  const bits = [
    parts.label ? (parts.labelIsTheme ? parts.label.toLowerCase() : parts.label) : t.everywhere,
    whenText(parts.dates, lang),
    parts.stay && t.nights(parts.stay.min, parts.stay.max),
    parts.weekend && !parts.dates?.weekend && t.weekend,
    parts.maxPrice && t.under(budgetText(parts.budget, lang)),
    parts.adults > 1 && t.adults(parts.adults),
    parts.sort === 'cheapest' && t.cheapest,
  ].filter(Boolean);
  return `${t.start} ${bits.join(', ')}.`;
}

// ---------- main ----------

export function parseQuery(input, { today, destinations, rates }) {
  const original = String(input ?? '').slice(0, 300);
  const folded = fold(original);
  const language = detectLanguage(original, folded.replace(/[^\p{L}\p{N} ]+/gu, ' '));
  let text = ` ${applyAliases(folded.replace(/[^\p{L}\p{N}€$ ]+/gu, ' ').replace(/\s+/g, ' ').trim())} `.replace(/\s+/g, ' ');

  const themes = matchThemes(text);
  // "Christmas market" is a theme, not a date; drop it before reading dates.
  THEME_WORDS.christmas.forEach((phrase) => { text = remove(text, phrase); });
  const dates = parseDates(text, today);
  if (dates?.phrase) text = remove(text, dates.phrase);
  const stay = parseStay(text);
  const weekend = Boolean(dates?.weekend || stay?.weekend || has(text, 'weekend') || has(text, 'weekendul'));
  const budget = parseBudget(folded, rates);
  const maxPrice = budget.eur;
  const adults = parseAdults(text);
  const sort = parseSort(text);

  const typed = typedAliases(` ${folded.replace(/[^\p{L}\p{N} ]+/gu, ' ')} `);
  const places = matchPlaces(text, original, destinations, typed);
  const themed = themedDestinations(themes, destinations);
  const both = places.iatas.filter((code) => themed.includes(code));
  const chosen = places.iatas.length && themed.length ? (both.length ? both : places.iatas) : [...places.iatas, ...themed];
  const labelIsTheme = Boolean(themes.length && (!places.iatas.length || both.length));
  const label = labelIsTheme ? THEME_LABELS[language][themes[0]] : places.names.slice(0, 3).join(', ');

  const understood = Boolean(chosen.length || dates || stay || weekend || maxPrice || adults || sort !== 'best');
  return {
    language,
    destinations: [...new Set(chosen)],
    label,
    departFrom: dates?.from ?? '',
    departTo: dates?.to ?? '',
    minNights: stay?.min ?? 0,
    maxNights: stay?.max ?? 0,
    weekendOnly: weekend,
    maxPrice,
    adults,
    sort,
    understood,
    reply: buildReply({ understood, label, labelIsTheme, dates, stay, weekend, maxPrice, budget, adults, sort }, language),
  };
}
