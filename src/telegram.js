import { parseIsoDate } from './dates.js';
import { HttpError } from './http.js';

const API = 'https://api.telegram.org';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch]);

export function flagEmoji(countryCode) {
  if (!/^[A-Z]{2}$/.test(countryCode ?? '')) return '🌍';
  return String.fromCodePoint(...[...countryCode].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function formatDate(iso) {
  const date = new Date(parseIsoDate(iso));
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export const formatEur = (amount) => `€${Math.round(amount)}`;

const formatLeg = (date, times) => (times?.length ? `${formatDate(date)} ${escapeHtml(times[0])}` : formatDate(date));

function groupByDestination(alerts) {
  const sorted = alerts.toSorted(
    (a, b) => a.trip.totalEur - b.trip.totalEur || a.trip.outDate.localeCompare(b.trip.outDate),
  );
  return [...Map.groupBy(sorted, (alert) => alert.destination.iata).values()];
}

// Live Wizz Air fares are bookable as shown; cached fares for other airlines need a fresh check.
const bookLabel = (trip) => (trip.source === 'travelpayouts' ? 'Check price on Aviasales' : 'Book on Wizz Air');

function formatGroup([best, ...others]) {
  const { destination: place, trip } = best;
  const more = others.length > 0 ? `+${plural(others.length, 'more date')}` : '';
  const link = trip.bookingUrl ? `<a href="${escapeHtml(trip.bookingUrl)}">${bookLabel(trip)}</a>` : '';
  const airline = trip.airline ? ` · ${escapeHtml(trip.airline)}` : '';
  return [
    '',
    `${flagEmoji(place.countryCode)} <b>${escapeHtml(place.name)}</b>, ${escapeHtml(place.country)} — <b>${formatEur(trip.totalEur)}</b>`,
    `${formatLeg(trip.outDate, trip.outTimes)} → ${formatLeg(trip.backDate, trip.backTimes)} · ${plural(trip.nights, 'night')}${airline}`,
    ...[[link, more].filter(Boolean).join(' · ')].filter(Boolean),
  ];
}

function chunk(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

function messageHeader(index, total, destinationCount, originName) {
  const part = total > 1 ? ` (${index + 1}/${total})` : '';
  const title = index === 0 ? plural(destinationCount, 'new deal') : 'More deals';
  return `✈️ <b>${title} from ${escapeHtml(originName)}</b>${part}`;
}

/**
 * Telegram messages (HTML parse mode) showing the cheapest trip per destination, cheapest first.
 * Split into several messages to stay well under Telegram's 4096-character limit; each carries the
 * destinations it covers so they can be marked as sent one message at a time.
 */
export function formatAlerts(alerts, { originName, maxReturnPriceEur, siteUrl, maxDestinationsPerMessage = 10 }) {
  const groups = groupByDestination(alerts);
  const parts = chunk(groups, maxDestinationsPerMessage);
  return parts.map((part, index) => {
    const isFirst = index === 0;
    const isLast = index === parts.length - 1;
    const text = [
      messageHeader(index, parts.length, groups.length, originName),
      ...(isFirst ? [`Return flights ≤ ${formatEur(maxReturnPriceEur)}`] : []),
      ...part.flatMap(formatGroup),
      ...(isLast && siteUrl ? ['', `<a href="${escapeHtml(siteUrl)}">See all deals →</a>`] : []),
    ].join('\n');
    return { text, iatas: part.map(([first]) => first.destination.iata) };
  });
}

// The bot token is part of the URL, so make sure it never ends up in logs.
function describeError(err, token) {
  const message = err instanceof HttpError
    ? `Telegram API error (HTTP ${err.status}): ${telegramDescription(err.body)}`
    : `Telegram API error: ${err.message}`;
  return message.replaceAll(token, '***');
}

function telegramDescription(body) {
  try {
    return JSON.parse(body).description ?? 'unknown error';
  } catch {
    return 'unknown error';
  }
}

/** Returns null when the bot token or chat id is missing, so alerts are simply skipped. */
export function createTelegramNotifier(http, env) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;

  return {
    async send(text) {
      try {
        await http.postJson(`${API}/bot${token}/sendMessage`, {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        throw new Error(describeError(err, token));
      }
    },
  };
}
