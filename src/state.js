// Alert history, tracked per destination rather than per date pair: many date combinations share the
// same price, and a new pair drifting into the top list must not look like a new deal.

// Exchange rates move a little every day; ignore drops smaller than this so we don't re-alert on noise.
export const MIN_PRICE_DROP_EUR = 1;

export const emptyState = () => ({ version: 2, destinations: {} });

export function normalizeState(raw) {
  const destinations = raw?.destinations;
  const isValid =
    raw?.version === 2 && destinations !== null && typeof destinations === 'object' && !Array.isArray(destinations);
  return isValid ? { version: 2, destinations: { ...destinations } } : emptyState();
}

/**
 * `bestPrices` maps each destination that has deals right now to its cheapest deal.
 * A destination is news (a fresh, unalerted record) when it newly has deals or got at least
 * MIN_PRICE_DROP_EUR cheaper. Destinations without deals are forgotten, so a later comeback is news again;
 * destinations that failed to scan keep their record untouched.
 */
export function updateState(state, { bestPrices, failed, nowIso }) {
  const current = Object.entries(bestPrices).map(([iata, priceEur]) => {
    const previous = state.destinations[iata];
    const isNews = !previous || priceEur <= previous.priceEur - MIN_PRICE_DROP_EUR;
    return [iata, isNews ? { priceEur, since: nowIso, alerted: false } : previous];
  });
  const carried = failed
    .filter((iata) => iata in state.destinations)
    .map((iata) => [iata, state.destinations[iata]]);
  return { ...state, destinations: Object.fromEntries([...carried, ...current]) };
}

/** Destinations with deals right now whose record hasn't been sent yet (including earlier failed sends). */
export function selectAlerts(state, iatasWithDeals) {
  return iatasWithDeals.filter((iata) => state.destinations[iata]?.alerted === false);
}

export function markAlerted(state, iatas) {
  const updated = iatas
    .filter((iata) => iata in state.destinations)
    .map((iata) => [iata, { ...state.destinations[iata], alerted: true }]);
  return { ...state, destinations: { ...state.destinations, ...Object.fromEntries(updated) } };
}
