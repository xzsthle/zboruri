// Destinations with deals first, then ones with any price, then ones with no flights; cheapest first.
const rank = (summary) => (summary.deals.length > 0 ? 0 : summary.cheapest ? 1 : 2);

const byRankThenPrice = (a, b) =>
  rank(a) - rank(b) ||
  (a.cheapest?.totalEur ?? 0) - (b.cheapest?.totalEur ?? 0) ||
  a.name.localeCompare(b.name);

/** The JSON the website reads from docs/data/deals.json. */
export function buildSiteData({ now, origin, config, summaries, state, failed }) {
  // dealSince: when this destination's current deal level first appeared (drives the "New" badge).
  const destinations = summaries.toSorted(byRankThenPrice).map((summary) => ({
    ...summary,
    dealSince: summary.deals.length > 0 ? state.destinations[summary.iata]?.since ?? null : null,
  }));

  return {
    generatedAt: now.toISOString(),
    source: 'Wizz Air',
    origin,
    rules: {
      maxReturnPriceEur: config.maxReturnPriceEur,
      minNights: config.minNights,
      maxNights: config.maxNights,
      daysAhead: config.daysAhead,
    },
    destinations,
    failed,
  };
}
