const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BOOKING_PREFIX = 'https://www.wizzair.com/';

export const ORIGIN_NAMES = { RMO: 'Chișinău' };

const parseDay = (iso) => new Date(`${iso}T00:00:00Z`);

export const fmtEur = (amount) => `€${Math.round(amount)}`;
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

export function flagEmoji(code) {
  if (!/^[A-Z]{2}$/.test(code ?? '')) return '🌍';
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export const safeBookingUrl = (url) => (typeof url === 'string' && url.startsWith(BOOKING_PREFIX) ? url : null);

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
