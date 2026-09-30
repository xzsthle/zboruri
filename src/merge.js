// Combines live Wizz Air round trips with cached fares for other airlines, per destination airport.

// Wizz Air and its sister airlines (Malta, UK, Abu Dhabi): the same network the live scan reads.
const WIZZ_GROUP = new Set(['W6', 'W4', 'W9', '5W']);

/**
 * wizz:   [{ dest, trips }] for destinations the live Wizz scan reached.
 * others: [{ destIata, trip }] from Travelpayouts.
 * Cached Wizz Air fares are dropped where live Wizz data exists (live beats cached), but kept for
 * routes the live scan couldn't reach. New destinations are resolved through `placeFor`.
 */
export function mergeSources({ wizz, others, placeFor, airlineName, originIata }) {
  const live = new Map(wizz.map(({ dest, trips }) => [dest.iata, { dest, trips }]));
  const extra = new Map();

  for (const { destIata, trip } of others) {
    if (destIata === originIata) continue;
    const wizz = WIZZ_GROUP.has(trip.airlineCode);
    if (live.has(destIata) && wizz) continue;
    const dest = live.get(destIata)?.dest ?? extra.get(destIata)?.dest ?? placeFor(destIata);
    if (!dest) continue;
    const named = { ...trip, airline: wizz ? 'Wizz Air' : airlineName(trip.airlineCode) ?? trip.airlineCode ?? 'Other airline' };
    extra.set(destIata, { dest, trips: [...(extra.get(destIata)?.trips ?? []), named] });
  }

  const merged = [...live.values()].map(({ dest, trips }) => ({ dest, trips: [...trips, ...(extra.get(dest.iata)?.trips ?? [])] }));
  const added = [...extra.entries()].filter(([iata]) => !live.has(iata)).map(([, entry]) => entry);
  return [...merged, ...added];
}
