// Small pure helpers shared by the search engine and the widget.

const fold = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Diacritic-insensitive match on city, country or airport code ("brasov" finds "Brașov"). */
export function matchesQuery(dest, query) {
  if (!query?.trim()) return true;
  return fold(`${dest.name} ${dest.country} ${dest.iata} ${dest.airportName ?? ''}`).includes(fold(query.trim()));
}

const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const LEAVE_FOR_WEEKEND = new Set([4, 5, 6]); // Thu, Fri, Sat
const BACK_FROM_WEEKEND = new Set([0, 1]); // Sun, Mon

/** A short trip that covers a weekend: out Thu–Sat, back Sun or Mon. */
export const isWeekendTrip = (trip) =>
  trip.nights <= 4 && LEAVE_FOR_WEEKEND.has(weekday(trip.outDate)) && BACK_FROM_WEEKEND.has(weekday(trip.backDate));
