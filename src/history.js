// Daily cheapest return price per destination, for the price-history chart on the website.

export const HISTORY_DAYS = 60;

export const emptyHistory = () => ({ version: 1, destinations: {} });

export function normalizeHistory(raw) {
  const destinations = raw?.destinations;
  const isValid = destinations !== null && typeof destinations === 'object' && !Array.isArray(destinations);
  return isValid ? { version: 1, destinations: { ...destinations } } : emptyHistory();
}

/**
 * `cheapestByIata` maps each destination priced in this run to its cheapest return trip.
 * Both daily scans land on the same day, so a day keeps the lowest price seen. Destinations that
 * weren't priced this run (failed scans) keep their history untouched.
 */
export function updateHistory(history, cheapestByIata, todayIso) {
  const updated = Object.entries(cheapestByIata).map(([iata, priceEur]) => {
    const days = history.destinations[iata] ?? [];
    const earlierToday = days.find(([day]) => day === todayIso)?.[1];
    const today = [todayIso, earlierToday == null ? priceEur : Math.min(earlierToday, priceEur)];
    return [iata, [...days.filter(([day]) => day !== todayIso), today].slice(-HISTORY_DAYS)];
  });
  return { ...history, destinations: { ...history.destinations, ...Object.fromEntries(updated) } };
}
