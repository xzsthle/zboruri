const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Only ever link out to the two booking sites the scanner produces.
const BOOKING_PREFIXES = ['https://www.wizzair.com/', 'https://www.aviasales.com/'];
// Scans run at these UTC hours (see .github/workflows/scan.yml).
const SCAN_HOURS_UTC = [5, 18];

export const ORIGIN_NAMES = { RMO: 'Chișinău' };

export const parseDay = (iso) => new Date(`${iso}T00:00:00Z`);
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Sat 24 Oct" */
export function fmtDay(iso) {
  const d = parseDay(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "24 Oct" */
export function fmtShort(iso) {
  const d = parseDay(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "24–26 Oct", or "30 Oct – 2 Nov" across months */
export function fmtShortRange(fromIso, toIso) {
  const from = parseDay(fromIso);
  const to = parseDay(toIso);
  return from.getUTCMonth() === to.getUTCMonth()
    ? `${from.getUTCDate()}–${fmtShort(toIso)}`
    : `${fmtShort(fromIso)} – ${fmtShort(toIso)}`;
}

/** "October 2026" */
export const fmtMonthLong = (year, monthIndex) => `${MONTHS_LONG[monthIndex]} ${year}`;

/** "Sat 24 Oct at 16:20" */
export const fmtLeg = (iso, times) => (times?.length ? `${fmtDay(iso)} at ${times[0]}` : fmtDay(iso));

export function fmtMonth(key, currentYear) {
  const [year, month] = key.split('-').map(Number);
  return year === currentYear ? MONTHS[month - 1] : `${MONTHS[month - 1]} ’${String(year).slice(2)}`;
}

export function fmtAgo(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/** Time until the next scheduled scan, e.g. "in 6 h". */
export function fmtNextScan(now = new Date()) {
  const candidates = [0, 1].flatMap((dayOffset) =>
    SCAN_HOURS_UTC.map((hour) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hour)));
  const next = candidates.find((time) => time > now.getTime());
  const minutes = Math.round((next - now.getTime()) / 60_000);
  return minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)} h`;
}

export function flagEmoji(code) {
  if (!/^[A-Z]{2}$/.test(code ?? '')) return '🌍';
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export const safeBookingUrl = (url) =>
  typeof url === 'string' && BOOKING_PREFIXES.some((prefix) => url.startsWith(prefix)) ? url : null;

/** Stable small integer from a string, used to give each destination the same colours every day. */
export function hashCode(text) {
  return [...text].reduce((hash, ch) => (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0, 7);
}

const SCORES = [
  { upTo: 0.55, dots: 5, label: 'Steal' },
  { upTo: 0.7, dots: 4, label: 'Great deal' },
  { upTo: 0.85, dots: 3, label: 'Good deal' },
  { upTo: 0.95, dots: 2, label: 'Fair deal' },
  { upTo: Infinity, dots: 1, label: 'Just under' },
];

/** How good a price is relative to the limit, as 1–5 dots. */
export const dealScore = (price, limit) => SCORES.find(({ upTo }) => price / limit <= upTo);

const CURRENCIES = {
  EUR: { prefix: '€', suffix: '' },
  MDL: { prefix: '', suffix: ' lei' },
  RON: { prefix: '', suffix: ' RON' },
  USD: { prefix: '$', suffix: '' },
};
export const CURRENCY_CODES = Object.keys(CURRENCIES);

/** Formats euro amounts in the viewer's chosen currency, using the scan's exchange rates. */
export function createMoney(rates, requested) {
  const code = CURRENCIES[requested] && Number.isFinite(rates?.[requested]) ? requested : 'EUR';
  const rate = code === 'EUR' ? 1 : rates[code];
  const { prefix, suffix } = CURRENCIES[code];
  const amount = (eur) => Math.round(eur * rate).toLocaleString('en-US');
  return { code, format: (eur) => `${prefix}${amount(eur)}${suffix}`, amount };
}
