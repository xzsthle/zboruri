// Pure helpers that shape docs/data/deals.json for the views.

/** Every deal as { dest, trip }, cheapest first. Older data without airline info counts as Wizz Air. */
export function allDeals(data) {
  return data.destinations
    .flatMap((dest) => dest.deals.map((trip) => ({ dest, trip: { airline: 'Wizz Air', source: 'wizz', ...trip } })))
    .sort((a, b) => a.trip.totalEur - b.trip.totalEur || a.trip.outDate.localeCompare(b.trip.outDate));
}

/** One group per destination, in the order the deals arrive. */
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
  if (!query?.trim()) return true;
  return fold(`${dest.name} ${dest.country} ${dest.iata}`).includes(fold(query.trim()));
}

const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const LEAVE_FOR_WEEKEND = new Set([4, 5, 6]); // Thu, Fri, Sat
const BACK_FROM_WEEKEND = new Set([0, 1]); // Sun, Mon

/** A short trip that covers a weekend: out Thu–Sat, back Sun or Mon. */
export const isWeekendTrip = (trip) =>
  trip.nights <= 4 && LEAVE_FOR_WEEKEND.has(weekday(trip.outDate)) && BACK_FROM_WEEKEND.has(weekday(trip.backDate));

export const STAYS = {
  any: { label: 'Any length', test: () => true },
  weekend: { label: 'Weekends', test: isWeekendTrip, icon: 'i-sun' },
  short: { label: '2–4 nights', test: (trip) => trip.nights <= 4 },
  long: { label: '5+ nights', test: (trip) => trip.nights >= 5 },
};

const SORTS = {
  price: (a, b) => a.trip.totalEur - b.trip.totalEur || a.trip.outDate.localeCompare(b.trip.outDate),
  soonest: (a, b) => a.trip.outDate.localeCompare(b.trip.outDate) || a.trip.totalEur - b.trip.totalEur,
  longest: (a, b) => b.trip.nights - a.trip.nights || a.trip.totalEur - b.trip.totalEur,
};

/** Applies the toolbar filters (month, stay, airline, search) and sort. */
export function filterDeals(deals, { month, stay, airline, query, sort }) {
  const stayTest = STAYS[stay]?.test ?? STAYS.any.test;
  return deals
    .filter(({ trip }) => !month || trip.outDate.startsWith(month))
    .filter(({ trip }) => stayTest(trip))
    .filter(({ trip }) => !airline || airline === 'all' || trip.airline === airline)
    .filter(({ dest }) => matchesQuery(dest, query))
    .toSorted(SORTS[sort] ?? SORTS.price);
}

export const airlinesOf = (deals) => [...new Set(deals.map(({ trip }) => trip.airline))].sort();

export function median(values) {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
