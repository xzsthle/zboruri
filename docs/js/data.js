// Pure helpers that shape docs/data/deals.json for the views.

/** Every deal as { dest, trip }, cheapest first. */
export function allDeals(data) {
  return data.destinations
    .flatMap((dest) => dest.deals.map((trip) => ({ dest, trip })))
    .sort((a, b) => a.trip.totalEur - b.trip.totalEur || a.trip.outDate.localeCompare(b.trip.outDate));
}

/** One group per destination, ordered by each destination's cheapest deal. */
export function groupByDestination(deals) {
  const groups = new Map();
  deals.forEach((deal) => groups.set(deal.dest.iata, [...(groups.get(deal.dest.iata) ?? []), deal]));
  return [...groups.values()];
}

export function monthCounts(deals) {
  const counts = new Map();
  deals.forEach(({ trip }) => {
    const key = trip.outDate.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const fold = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Diacritic-insensitive match on city, country or airport code ("brasov" finds "Brașov"). */
export function matchesQuery(dest, query) {
  if (!query) return true;
  return fold(`${dest.name} ${dest.country} ${dest.iata}`).includes(fold(query.trim()));
}
