/** Fetches every date window for one destination (sequentially, pausing between requests). */
export async function scanDestination({ wizz, version, origin, dest, windows, pause }) {
  const parts = [];
  for (const window of windows) {
    parts.push(await wizz.getTimetable(version, origin, dest.iata, window));
    await pause();
  }
  return {
    dest,
    outbound: parts.flatMap((part) => part.outbound),
    inbound: parts.flatMap((part) => part.inbound),
  };
}

// Several failures in a row means Wizz Air is down or blocking us; waiting out every remaining
// timeout would blow the job's time limit and lose the whole run.
const MAX_CONSECUTIVE_FAILURES = 5;

async function scanEach(destinations, context, log, maxConsecutiveFailures) {
  const results = [];
  const failed = [];
  let failureStreak = 0;
  for (const [index, dest] of destinations.entries()) {
    if (failureStreak >= maxConsecutiveFailures) {
      log.warn(`Stopping after ${failureStreak} failures in a row — Wizz Air looks unavailable`);
      return { results, failed: [...failed, ...destinations.slice(index)] };
    }
    try {
      const result = await scanDestination({ ...context, dest });
      results.push(result);
      failureStreak = 0;
      log.info(`${dest.iata} ${dest.name}: ${result.outbound.length} outbound / ${result.inbound.length} return fares`);
    } catch (err) {
      failed.push(dest);
      failureStreak += 1;
      log.warn(`${dest.iata}: scan failed — ${err.message}`);
    }
  }
  return { results, failed };
}

/**
 * Scans all destinations; a failing route is logged instead of stopping the run.
 * Wizz Air rate-limits bursts with HTTP 503, so failures get one more try after a cool-down.
 */
export async function scanAll({ destinations, log, cooldown, maxConsecutiveFailures = MAX_CONSECUTIVE_FAILURES, ...context }) {
  const first = await scanEach(destinations, context, log, maxConsecutiveFailures);
  if (first.failed.length === 0) return { results: first.results, failed: [] };

  log.info(`Retrying ${first.failed.length} destination(s) after a cool-down…`);
  await cooldown();
  const second = await scanEach(first.failed, context, log, maxConsecutiveFailures);
  return {
    results: [...first.results, ...second.results],
    failed: second.failed.map((dest) => dest.iata),
  };
}
