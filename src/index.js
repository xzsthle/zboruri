import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { fetchEurRates } from './fx.js';
import { createHttp, sleep } from './http.js';
import { run } from './run.js';
import { createFileStore } from './store.js';
import { createTelegramNotifier } from './telegram.js';
import { createWizzClient } from './wizz.js';

const fromRoot = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

// Wizz Air answers bursts with HTTP 503: back off generously and cool down before retrying failed routes,
// but keep timeouts short so an outage can't run past the job's 30-minute limit.
const WIZZ_HTTP = { retries: 2, backoffMs: 5_000, timeoutMs: 15_000 };
const RETRY_COOLDOWN_MS = 60_000;
// Never retry sendMessage: a retry after a timeout can deliver the same alert twice.
const TELEGRAM_HTTP = { retries: 0, timeoutMs: 15_000 };

// wizzair.com expects a normal browser; plain Node's default user agent is more likely to be rejected.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  'Accept-Language': 'en-GB,en;q=0.9',
};

// In GitHub Actions, ::warning:: / ::error:: lines show up as annotations on the run page.
const inActions = Boolean(process.env.GITHUB_ACTIONS);
const log = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(inActions ? `::warning::${message}` : `⚠ ${message}`),
  error: (message) => console.error(inActions ? `::error::${message}` : `✖ ${message}`),
};

async function main() {
  const config = await loadConfig(fromRoot('config.json'));
  const http = createHttp({ headers: BROWSER_HEADERS, ...WIZZ_HTTP });
  const notifier = createTelegramNotifier(createHttp(TELEGRAM_HTTP), process.env);

  const result = await run({
    config,
    wizz: createWizzClient(http),
    getRates: () => fetchEurRates(http.getJson),
    notifier,
    store: createFileStore({ statePath: fromRoot('data/state.json'), siteDataPath: fromRoot('docs/data/deals.json') }),
    clock: { now: () => new Date() },
    pause: () => sleep(config.requestDelayMs),
    cooldown: () => sleep(RETRY_COOLDOWN_MS),
    log,
    siteUrl: process.env.SITE_URL ?? '',
  });

  log.info(
    `Done: ${result.deals} deal(s) ≤ €${config.maxReturnPriceEur}, ${result.alerts} new, ` +
      `${result.failed.length} destination(s) failed`,
  );

  // On GitHub, missing secrets would otherwise mean green runs and silently no alerts.
  if (inActions && !notifier) {
    throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secrets are missing — add them under Settings → Secrets and variables → Actions');
  }
}

main().catch((err) => {
  log.error(err.message);
  process.exitCode = 1;
});
