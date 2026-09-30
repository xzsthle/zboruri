import { addDays, dateWindows, toIsoDate } from './dates.js';
import { fareLegs, flattenDeals, summarizeTrips, wizzTrips } from './deals.js';
import { updateHistory } from './history.js';
import { mergeSources } from './merge.js';
import { loadReference, scanOtherAirlines } from './other-airlines.js';
import { scanAll } from './scan.js';
import { buildFaresData, buildSiteData } from './site-data.js';
import { markAlerted, selectAlerts, updateState } from './state.js';
import { formatAlerts } from './telegram.js';
import { bookingUrl, MAX_WINDOW_DAYS } from './wizz.js';

function assertEnoughScanned(results, total) {
  if (total === 0) {
    throw new Error('Wizz Air returned no destinations — nothing to scan');
  }
  if (results.length * 2 < total) {
    throw new Error(`Only ${results.length} of ${total} destinations could be scanned — Wizz Air may be blocking requests`);
  }
  // Every route empty means the response format changed, not that nobody is flying.
  if (results.every((r) => r.outbound.length === 0 && r.inbound.length === 0)) {
    throw new Error('Wizz Air returned no prices for any route — its API format may have changed');
  }
}

/** Sends one message at a time and marks its destinations as alerted only once Telegram accepts it. */
async function sendAlerts({ notifier, alerts, state, origin, config, siteUrl, log }) {
  if (alerts.length === 0) return { state };
  if (!notifier) {
    log.warn('Telegram is not configured — new deals were not sent');
    return { state };
  }
  const messages = formatAlerts(alerts, { originName: origin.name, maxReturnPriceEur: config.maxReturnPriceEur, siteUrl });
  let current = state;
  for (const { text, iatas } of messages) {
    try {
      await notifier.send(text);
      current = markAlerted(current, iatas);
    } catch (error) {
      log.error(`Could not send the Telegram alert: ${error.message}`);
      return { state: current, error };
    }
  }
  log.info(`Sent ${messages.length} Telegram message(s)`);
  return { state: current };
}

/** Live Wizz Air scan: route map, fare calendars for every destination, then round trips. */
async function scanWizz({ config, wizz, rates, today, pause, cooldown, log }) {
  const version = await wizz.getApiVersion();
  const { origin, destinations } = await wizz.getRouteMap(version, config.origin);
  log.info(`Wizz Air API ${version}: ${destinations.length} destinations from ${origin.iata}`);

  const windows = dateWindows(addDays(today, 1), config.daysAhead, MAX_WINDOW_DAYS);
  const { results, failed } = await scanAll({
    wizz, version, origin: origin.iata, destinations, windows, pause, cooldown, log,
  });
  assertEnoughScanned(results, destinations.length);

  const linkFor = (dest, outDate, backDate) => bookingUrl(origin.iata, dest, outDate, backDate);
  const priced = results.map((scan) => ({ dest: scan.dest, trips: wizzTrips(scan, { rates, config, linkFor }) }));
  const legs = Object.fromEntries(results.map((scan) => [scan.dest.iata, fareLegs(scan, rates)]));
  return { origin, priced, legs, failed, window: { fromIso: windows[0].from, toIso: windows.at(-1).to } };
}

/**
 * One scan: live Wizz Air fares plus (optionally) cached fares for other airlines, merged per destination;
 * alert on new or cheaper destinations; publish site data and price history.
 * Everything is written even when Telegram fails, and unsent alerts are retried next run.
 */
export async function run(deps) {
  const { config, getRates, store, clock, log } = deps;
  const now = clock.now();
  const today = toIsoDate(now.getTime());

  const rates = await getRates();
  const { origin: wizzOrigin, priced, legs, failed, window } = await scanWizz({ ...deps, rates, today });
  const reference = await loadReference(deps);
  const others = await scanOtherAirlines({ ...deps, origin: wizzOrigin.iata, ...window });

  // Airport names and time zones power the flight details (local arrival times) on the website.
  const withAirport = (place) => ({ ...place, ...reference.airportInfo(place.iata) });
  const origin = withAirport(wizzOrigin);
  const merged = mergeSources({ wizz: priced, others: others.found, originIata: origin.iata, ...reference });
  const summaries = merged.map(({ dest, trips }) => summarizeTrips(withAirport(dest), trips, config));
  const bestPrices = Object.fromEntries(summaries.filter((s) => s.deals.length > 0).map((s) => [s.iata, s.deals[0].totalEur]));
  const cheapest = Object.fromEntries(summaries.filter((s) => s.cheapest).map((s) => [s.iata, s.cheapest.totalEur]));

  const updated = updateState(await store.readState(), { bestPrices, failed, nowIso: now.toISOString() });
  const alertIatas = selectAlerts(updated, Object.keys(bestPrices));
  const alerts = flattenDeals(summaries).filter((deal) => alertIatas.includes(deal.destination.iata));
  const { state, error } = await sendAlerts({ ...deps, origin, alerts, state: updated });

  const otherAirlinesActive = others.status.status === 'ok';
  await store.writeSiteData(buildSiteData({ now, origin, config, summaries, state, failed, rates, otherAirlinesActive }));
  await store.writeFares(buildFaresData({ now, merged, legs }));
  await store.writeHistory(updateHistory(await store.readHistory(), cheapest, today));
  await store.writeState(state);
  if (error) throw error;
  return { deals: flattenDeals(summaries).length, alerts: alertIatas.length, failed, otherAirlines: others.status };
}
