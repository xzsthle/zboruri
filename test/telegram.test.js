import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramNotifier, escapeHtml, flagEmoji, formatAlerts, formatDate, formatEur } from '../src/telegram.js';
import { HttpError } from '../src/http.js';

const BUD = { iata: 'BUD', name: 'Budapest', country: 'Hungary', countryCode: 'HU' };
const BGY = { iata: 'BGY', name: 'Milan <Bergamo>', country: 'Italy', countryCode: 'IT' };
const trip = (outDate, backDate, totalEur, nights) => ({
  outDate, outTimes: ['16:30'], backDate, backTimes: [], nights, totalEur,
  bookingUrl: `https://book.test/${outDate}?a=1&b=2`,
});
const alert = (destination, t) => ({ key: `${destination.iata}|${t.outDate}|${t.backDate}`, destination, trip: t });
const context = { originName: 'Chisinau', maxReturnPriceEur: 60, siteUrl: 'https://me.github.io/zboruri/' };

test('escapeHtml escapes characters Telegram HTML treats specially', () => {
  assert.equal(escapeHtml('a < b & c > "d"'), 'a &lt; b &amp; c &gt; &quot;d&quot;');
});

test('flagEmoji turns a country code into a flag and falls back to a globe', () => {
  assert.equal(flagEmoji('IT'), '🇮🇹');
  assert.equal(flagEmoji(undefined), '🌍');
});

test('formatDate and formatEur produce short human labels', () => {
  assert.equal(formatDate('2026-10-05'), 'Mon 5 Oct');
  assert.equal(formatEur(33.69), '€34');
});

test('formatAlerts groups trips by destination, cheapest first, with booking links', () => {
  const messages = formatAlerts([
    alert(BUD, trip('2026-10-09', '2026-10-12', 45.2, 3)),
    alert(BGY, trip('2026-10-05', '2026-10-07', 20, 2)),
    alert(BGY, trip('2026-10-14', '2026-10-17', 31, 3)),
  ], context);

  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].iatas, ['BGY', 'BUD']);
  assert.equal(messages[0].text, [
    '✈️ <b>2 new deals from Chisinau</b>',
    'Return flights ≤ €60',
    '',
    '🇮🇹 <b>Milan &lt;Bergamo&gt;</b>, Italy — <b>€20</b>',
    'Mon 5 Oct 16:30 → Wed 7 Oct · 2 nights',
    '<a href="https://book.test/2026-10-05?a=1&amp;b=2">Book on Wizz Air</a> · +1 more date',
    '',
    '🇭🇺 <b>Budapest</b>, Hungary — <b>€45</b>',
    'Fri 9 Oct 16:30 → Mon 12 Oct · 3 nights',
    '<a href="https://book.test/2026-10-09?a=1&amp;b=2">Book on Wizz Air</a>',
    '',
    '<a href="https://me.github.io/zboruri/">See all deals →</a>',
  ].join('\n'));
});

test('formatAlerts splits many destinations over several messages so none is dropped', () => {
  const messages = formatAlerts(
    [alert(BUD, trip('2026-10-09', '2026-10-12', 45, 3)), alert(BGY, trip('2026-10-05', '2026-10-07', 20, 2))],
    { ...context, maxDestinationsPerMessage: 1 },
  );
  assert.deepEqual(messages.map((m) => m.iatas), [['BGY'], ['BUD']]);
  assert.match(messages[0].text, /^✈️ <b>2 new deals from Chisinau<\/b> \(1\/2\)/);
  assert.doesNotMatch(messages[0].text, /See all deals/);
  assert.match(messages[1].text, /^✈️ <b>More deals from Chisinau<\/b> \(2\/2\)/);
  assert.match(messages[1].text, /Budapest/);
  assert.match(messages[1].text, /See all deals/);
});

test('formatAlerts names the airline and links cached fares to Aviasales', () => {
  const cached = { ...trip('2026-10-09', '2026-10-12', 45, 3), airline: 'Fly One', source: 'travelpayouts' };
  const [message] = formatAlerts([alert(BUD, cached)], { ...context, siteUrl: '' });
  assert.match(message.text, /Fri 9 Oct 16:30 → Mon 12 Oct · 3 nights · Fly One$/m);
  assert.match(message.text, />Check price on Aviasales<\/a>/);
});

test('formatAlerts uses the singular for one deal and escapes departure times', () => {
  const odd = { ...trip('2026-10-09', '2026-10-12', 45, 1), outTimes: ['<x>'] };
  const [message] = formatAlerts([alert(BUD, odd)], { ...context, siteUrl: '' });
  assert.match(message.text, /^✈️ <b>1 new deal from/);
  assert.match(message.text, /Fri 9 Oct &lt;x&gt; → Mon 12 Oct · 1 night$/m);
});

test('createTelegramNotifier returns null until both secrets are set', () => {
  assert.equal(createTelegramNotifier({}, {}), null);
  assert.equal(createTelegramNotifier({}, { TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: '  ' }), null);
});

test('the notifier posts an HTML message to the Bot API', async () => {
  let request;
  const http = { postJson: async (url, body) => { request = { url, body }; return { ok: true }; } };
  const notifier = createTelegramNotifier(http, { TELEGRAM_BOT_TOKEN: 'secret-token', TELEGRAM_CHAT_ID: '42' });
  await notifier.send('<b>hi</b>');
  assert.equal(request.url, 'https://api.telegram.org/botsecret-token/sendMessage');
  assert.deepEqual(request.body, { chat_id: '42', text: '<b>hi</b>', parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
});

test('the notifier reports API errors without leaking the bot token', async () => {
  const http = {
    postJson: async (url) => { throw new HttpError(401, url, '{"ok":false,"description":"Unauthorized"}'); },
  };
  const notifier = createTelegramNotifier(http, { TELEGRAM_BOT_TOKEN: 'secret-token', TELEGRAM_CHAT_ID: '42' });
  await assert.rejects(notifier.send('hi'), (err) => {
    assert.equal(err.message, 'Telegram API error (HTTP 401): Unauthorized');
    assert.doesNotMatch(err.message + err.stack, /secret-token/);
    return true;
  });
});

test('the notifier reports network errors without leaking the bot token', async () => {
  const http = { postJson: async () => { throw new TypeError('fetch failed'); } };
  const notifier = createTelegramNotifier(http, { TELEGRAM_BOT_TOKEN: 'secret-token', TELEGRAM_CHAT_ID: '42' });
  await assert.rejects(notifier.send('hi'), /^Error: Telegram API error: fetch failed$/);
});
