import { daysBetween } from './dates.js';
import { toEur } from './fx.js';

const round2 = (n) => Math.round(n * 100) / 100;

const byPriceThenDate = (a, b) =>
  a.totalEur - b.totalEur || a.outDate.localeCompare(b.outDate) || a.backDate.localeCompare(b.backDate);

export function toEurFares(fares, rates) {
  return fares.map(({ date, times, amount, currency }) => ({ date, times, priceEur: toEur(amount, currency, rates) }));
}

/** Keeps the cheapest fare for each date (windows can overlap), sorted by date. */
export function cheapestPerDate(fares) {
  const best = new Map();
  for (const fare of fares) {
    const current = best.get(fare.date);
    if (!current || fare.priceEur < current.priceEur) best.set(fare.date, fare);
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Every outbound/return pairing whose stay falls within [minNights, maxNights]. */
export function roundTrips(outbound, inbound, { minNights, maxNights }) {
  return outbound.flatMap((out) =>
    inbound
      .map((back) => ({ out, back, nights: daysBetween(out.date, back.date) }))
      .filter(({ nights }) => nights >= minNights && nights <= maxNights)
      .map(({ out, back, nights }) => ({
        outDate: out.date,
        outTimes: out.times,
        outEur: out.priceEur,
        backDate: back.date,
        backTimes: back.times,
        backEur: back.priceEur,
        nights,
        totalEur: round2(out.priceEur + back.priceEur),
      })),
  );
}

export function summarizeDestination({ dest, outbound, inbound }, { rates, config, linkFor }) {
  const trips = roundTrips(
    cheapestPerDate(toEurFares(outbound, rates)),
    cheapestPerDate(toEurFares(inbound, rates)),
    config,
  )
    .toSorted(byPriceThenDate)
    .map((trip) => ({ ...trip, bookingUrl: linkFor(dest.iata, trip.outDate, trip.backDate) }));
  const underLimit = trips.filter((trip) => trip.totalEur <= config.maxReturnPriceEur);

  return {
    ...dest,
    cheapest: trips[0] ?? null,
    deals: underLimit.slice(0, config.maxDealsPerDestination),
    dealCount: underLimit.length,
  };
}

export function flattenDeals(summaries) {
  return summaries.flatMap((summary) => {
    const destination = {
      iata: summary.iata,
      name: summary.name,
      country: summary.country,
      countryCode: summary.countryCode,
    };
    return summary.deals.map((trip) => ({ destination, trip }));
  });
}
