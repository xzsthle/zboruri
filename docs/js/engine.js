// In-browser flight search over the scanner's data: pairs live Wizz Air one-way fares for any dates,
// blends in cached round trips for other airlines, and answers the calendar / month questions.

import { isWeekendTrip } from './data.js';
import { departSpec } from './query.js';

const DAY_MS = 86_400_000;
const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoFromDay = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

export const TIME_WINDOWS = {
  morning: { label: 'Morning', range: '06:00 – 11:59', from: 6, to: 12 },
  afternoon: { label: 'Afternoon', range: '12:00 – 17:59', from: 12, to: 18 },
  evening: { label: 'Evening', range: '18:00 – 23:59', from: 18, to: 24 },
  night: { label: 'Night', range: '00:00 – 05:59', from: 0, to: 6 },
};

export function windowOf(time) {
  if (!time) return null;
  const hour = Number(time.slice(0, 2));
  return Object.entries(TIME_WINDOWS).find(([, w]) => hour >= w.from && hour < w.to)?.[0] ?? null;
}

function departMatches(date, spec) {
  if (spec.type === 'date') return date === spec.date;
  if (spec.type === 'range') return date >= spec.from && date <= spec.to;
  if (spec.type === 'month') return date.startsWith(spec.month);
  return true;
}

/** Early departures and late returns are a hassle; cached prices are less certain. */
const bestScore = (trip) =>
  trip.pricePp + (windowOf(trip.outTime) === 'night' ? 8 : 0) + (trip.backTime && trip.backTime >= '22:00' ? 4 : 0) + (trip.source === 'travelpayouts' ? 6 : 0);

export const SORTS = {
  best: (a, b) => bestScore(a) - bestScore(b) || a.pricePp - b.pricePp,
  cheapest: (a, b) => a.pricePp - b.pricePp || a.outDate.localeCompare(b.outDate),
  soonest: (a, b) => a.outDate.localeCompare(b.outDate) || a.pricePp - b.pricePp,
};

function passesFilters(trip, filters) {
  if (filters.airlines?.length && !filters.airlines.includes(trip.airline)) return false;
  if (filters.outWin?.length && !filters.outWin.includes(windowOf(trip.outTime))) return false;
  if (filters.backWin?.length && !filters.backWin.includes(windowOf(trip.backTime))) return false;
  if (filters.maxPrice != null && trip.pricePp > filters.maxPrice) return false;
  if (filters.weekend && !isWeekendTrip(trip)) return false;
  return true;
}

export function createEngine(site, fares) {
  const destinations = new Map(site.destinations.map((dest) => [dest.iata, dest]));
  // Pre-index return legs by day number so pairing is a lookup, not a nested scan.
  const indexed = new Map(Object.entries(fares?.destinations ?? {}).map(([iata, legs]) => [iata, {
    out: legs.out.map(([date, times, eur]) => ({ date, day: dayNumber(date), time: times?.[0] ?? null, flights: times?.length ?? 0, eur })),
    backByDay: new Map(legs.back.map(([date, times, eur]) => [dayNumber(date), { date, time: times?.[0] ?? null, eur }])),
    cached: legs.cached ?? [],
  }]));

  function liveTrips(iata, query, depart) {
    const legs = indexed.get(iata);
    if (!legs) return [];
    const returnDay = query.back ? dayNumber(query.back) : null;
    return legs.out.filter((out) => departMatches(out.date, depart)).flatMap((out) => {
      const nightsList = returnDay != null
        ? [returnDay - out.day]
        : Array.from({ length: query.max - query.min + 1 }, (_, i) => query.min + i);
      return nightsList.filter((n) => n >= 1).map((nights) => ({ out, back: legs.backByDay.get(out.day + nights), nights })).filter(({ back }) => back)
        .map(({ out, back, nights }) => ({
          iata, outDate: out.date, outTime: out.time, backDate: back.date, backTime: back.time, nights,
          pricePp: Math.round((out.eur + back.eur) * 100) / 100, outEur: out.eur, backEur: back.eur,
          airline: 'Wizz Air', airlineCode: 'W6', source: 'wizz', stops: 0, bookingUrl: null,
        }));
    });
  }

  function cachedTrips(iata, query, depart) {
    if (!query.others) return [];
    return (indexed.get(iata)?.cached ?? [])
      .filter((trip) => departMatches(trip.outDate, depart))
      .filter((trip) => (query.back ? trip.backDate === query.back : trip.nights >= query.min && trip.nights <= query.max))
      .map((trip) => ({
        iata, outDate: trip.outDate, outTime: trip.outTimes?.[0] ?? null, backDate: trip.backDate, backTime: trip.backTimes?.[0] ?? null,
        nights: trip.nights, pricePp: trip.totalEur, airline: trip.airline ?? trip.airlineCode ?? 'Other airline',
        airlineCode: trip.airlineCode ?? '', source: 'travelpayouts', stops: trip.stops ?? 0, bookingUrl: trip.bookingUrl ?? null,
      }));
  }

  /** Every trip to one destination that fits the query (before result filters). */
  function tripsFor(iata, query, depart = departSpec(query.depart)) {
    return [...liveTrips(iata, query, depart), ...cachedTrips(iata, query, depart)];
  }

  // 'anywhere', one airport, or a comma-separated list of airports.
  const targets = (to) => (!to || to === 'anywhere' ? [...indexed.keys()] : to.split(',').filter((code) => indexed.has(code)));

  /** Results for one destination, filtered and sorted. */
  function search(query, filters) {
    return tripsFor(query.to, query).filter((trip) => passesFilters(trip, filters)).toSorted(SORTS[filters.sort] ?? SORTS.best);
  }

  /** "Everywhere" (or a list of airports): the best trip per destination, cheapest first. */
  function explore(query, filters) {
    return targets(query.to).flatMap((iata) => {
      const trips = tripsFor(iata, query).filter((trip) => passesFilters(trip, filters));
      if (trips.length === 0 || !destinations.has(iata)) return [];
      const best = trips.reduce((a, b) => (SORTS.cheapest(a, b) <= 0 ? a : b));
      return [{ dest: destinations.get(iata), best, count: trips.length }];
    }).toSorted((a, b) => a.best.pricePp - b.best.pricePp);
  }

  /** Cheapest return starting on each day (stay rules apply, depart doesn't): Map(date → price). */
  function pricesByDepartDay(query, iata = query.to) {
    const map = new Map();
    targets(iata).forEach((code) => tripsFor(code, { ...query, back: '' }, { type: 'anytime' }).forEach((trip) => {
      map.set(trip.outDate, Math.min(map.get(trip.outDate) ?? Infinity, trip.pricePp));
    }));
    return map;
  }

  /** For a fixed departure day: cheapest total for each possible return day. */
  function pricesByReturnDay(query, departDate, iata = query.to) {
    const map = new Map();
    const open = { ...query, back: '', min: 1, max: Math.max(query.max, 14) };
    targets(iata).forEach((code) => tripsFor(code, open, { type: 'date', date: departDate }).forEach((trip) => {
      map.set(trip.backDate, Math.min(map.get(trip.backDate) ?? Infinity, trip.pricePp));
    }));
    return map;
  }

  function pricesByMonth(query, iata = query.to) {
    const map = new Map();
    pricesByDepartDay(query, iata).forEach((price, date) => {
      const month = date.slice(0, 7);
      map.set(month, Math.min(map.get(month) ?? Infinity, price));
    });
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  const dateRange = () => {
    const days = [...indexed.values()].flatMap((legs) => legs.out.map((out) => out.day));
    return days.length ? { first: isoFromDay(Math.min(...days)), last: isoFromDay(Math.max(...days)) } : null;
  };

  return {
    destinations, search, explore, tripsFor, pricesByDepartDay, pricesByReturnDay, pricesByMonth, dateRange,
    airlines: () => [...new Set([...indexed.values()].flatMap((legs) => [legs.out.length ? 'Wizz Air' : null, ...legs.cached.map((t) => t.airline)]).filter(Boolean))].sort(),
  };
}
