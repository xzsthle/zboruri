// Destinations with deals first, then ones with any price, then ones with no flights; cheapest first.
const rank = (summary) => (summary.deals.length > 0 ? 0 : summary.cheapest ? 1 : 2);

const byRankThenPrice = (a, b) =>
  rank(a) - rank(b) ||
  (a.cheapest?.totalEur ?? 0) - (b.cheapest?.totalEur ?? 0) ||
  a.name.localeCompare(b.name);

// Currencies the website can show prices in (EUR per unit comes from the scan's exchange rates).
const DISPLAY_CURRENCIES = ['EUR', 'MDL', 'RON', 'USD'];

const pickRates = (rates) =>
  Object.fromEntries(DISPLAY_CURRENCIES.filter((code) => Number.isFinite(rates[code])).map((code) => [code, rates[code]]));

/** The JSON the website reads from docs/data/deals.json. */
export function buildSiteData({ now, origin, config, summaries, state, failed, rates, otherAirlinesActive }) {
  // dealSince: when this destination's current deal level first appeared (drives the "New" badge).
  const destinations = summaries.toSorted(byRankThenPrice).map((summary) => ({
    ...summary,
    dealSince: summary.deals.length > 0 ? state.destinations[summary.iata]?.since ?? null : null,
  }));

  return {
    generatedAt: now.toISOString(),
    sources: [
      { id: 'wizz', name: 'Wizz Air', live: true },
      ...(otherAirlinesActive ? [{ id: 'travelpayouts', name: 'Other airlines (Aviasales)', live: false }] : []),
    ],
    origin,
    rules: {
      maxReturnPriceEur: config.maxReturnPriceEur,
      minNights: config.minNights,
      maxNights: config.maxNights,
      daysAhead: config.daysAhead,
    },
    rates: pickRates(rates),
    destinations,
    failed,
  };
}

/**
 * docs/data/fares.json: the raw material for the website's search. Live Wizz Air one-way fares per day
 * (paired client-side for any dates) plus cached round trips for other airlines.
 */
export function buildFaresData({ now, merged, legs }) {
  const destinations = Object.fromEntries(merged.map(({ dest, trips }) => [dest.iata, {
    out: legs[dest.iata]?.out ?? [],
    back: legs[dest.iata]?.back ?? [],
    cached: trips.filter((trip) => trip.source === 'travelpayouts'),
  }]));
  return { generatedAt: now.toISOString(), currency: 'EUR', destinations };
}
