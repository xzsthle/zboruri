// Travelpayouts / Aviasales Data API: cached round-trip prices for every airline (Fly One, HiSky, Ajet,
// Turkish, LOT…). Prices come from searches other people made recently, so they are labelled as
// "check price" rather than live. Needs a free token; the reference files (names, coordinates) are public.

import { daysBetween } from './dates.js';
import { HttpError } from './http.js';

const PRICES_URL = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const DATA_URL = 'https://api.travelpayouts.com/data/en';
const SITE = 'https://www.aviasales.com';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IATA = /^[A-Z]{3}$/;

export class TravelpayoutsAuthError extends Error {
  constructor() {
    super('Travelpayouts rejected the API token — check the TRAVELPAYOUTS_TOKEN secret');
    this.name = 'TravelpayoutsAuthError';
  }
}

/** "2026-09-30".."2027-01-27" → ['2026-09', …, '2027-01'] */
export function departureMonths(fromIso, toIso) {
  const [fromYear, fromMonth] = fromIso.split('-').map(Number);
  const [toYear, toMonth] = toIso.split('-').map(Number);
  const count = (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
  return Array.from({ length: count }, (_, i) => {
    const index = fromMonth - 1 + i;
    return `${fromYear + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

const localDate = (value) => String(value ?? '').slice(0, 10);
const localTimes = (value) => {
  const match = /T(\d{2}:\d{2})/.exec(String(value ?? ''));
  return match ? [match[1]] : [];
};

function bookingLink(link, marker) {
  if (typeof link !== 'string' || !link.startsWith('/')) return null;
  const url = `${SITE}${link}`;
  return marker ? `${url}${url.includes('?') ? '&' : '?'}marker=${encodeURIComponent(marker)}` : url;
}

function toTrip(row, { fromIso, toIso, minNights, maxNights, marker }) {
  const outDate = localDate(row.departure_at);
  const backDate = localDate(row.return_at);
  const destIata = row.destination_airport || row.destination;
  const price = Number(row.price);
  if (!ISO_DATE.test(outDate) || !ISO_DATE.test(backDate) || !IATA.test(destIata ?? '') || !(price > 0)) return null;
  if (outDate < fromIso || outDate > toIso) return null;
  const nights = daysBetween(outDate, backDate);
  if (nights < minNights || nights > maxNights) return null;

  return {
    destIata,
    trip: {
      outDate,
      outTimes: localTimes(row.departure_at),
      backDate,
      backTimes: localTimes(row.return_at),
      nights,
      totalEur: Math.round(price * 100) / 100,
      airlineCode: typeof row.airline === 'string' ? row.airline : null,
      stops: (Number(row.transfers) || 0) + (Number(row.return_transfers) || 0),
      bookingUrl: bookingLink(row.link, marker),
      source: 'travelpayouts',
    },
  };
}

/** API response → [{ destIata, trip }], keeping only valid round trips inside the window and stay range. */
export function parsePrices(body, options) {
  if (body?.success === false) throw new Error(`Travelpayouts: ${body.error ?? 'request failed'}`);
  if (!Array.isArray(body?.data)) throw new Error('Travelpayouts returned an unexpected response');
  return body.data.map((row) => toTrip(row, options)).filter(Boolean);
}

/** Public reference files → lookups for destination places and airline names. */
export function buildReference({ airports, cities, countries, airlines }) {
  const byCode = (list) => new Map((Array.isArray(list) ? list : []).map((item) => [item.code, item]));
  const airportByCode = byCode(airports);
  const cityByCode = byCode(cities);
  const countryByCode = byCode(countries);
  const airlineByCode = byCode(airlines);

  const placeFor = (iata) => {
    const airport = airportByCode.get(iata);
    const city = cityByCode.get(airport?.city_code ?? iata);
    const entry = airport ?? city;
    if (!entry || !city?.name) return null;
    const countryCode = entry.country_code ?? city.country_code;
    return {
      iata,
      name: city.name,
      country: countryByCode.get(countryCode)?.name ?? countryCode,
      countryCode,
      lat: entry.coordinates?.lat ?? null,
      lon: entry.coordinates?.lon ?? null,
    };
  };
  const airlineName = (code) => airlineByCode.get(code)?.name ?? null;
  const airportInfo = (iata) => {
    const airport = airportByCode.get(iata);
    return airport ? { airportName: airport.name, timeZone: airport.time_zone } : {};
  };
  return { placeFor, airlineName, airportInfo };
}

/** The public reference files (no token needed): places, airport names, time zones, airline names. */
export function createReferenceClient(http) {
  async function fetchReference() {
    const [airports, cities, countries, airlines] = await Promise.all(
      ['airports', 'cities', 'countries', 'airlines'].map((name) => http.getJson(`${DATA_URL}/${name}.json`)),
    );
    return buildReference({ airports, cities, countries, airlines });
  }
  return { fetchReference };
}

export function createTravelpayoutsClient(http, { token, marker = '' }) {
  async function fetchPrices({ origin, month, directOnly }) {
    const params = new URLSearchParams({
      origin,
      departure_at: month,
      one_way: 'false',
      direct: String(directOnly),
      unique: 'false',
      sorting: 'price',
      currency: 'eur',
      limit: '1000',
    });
    try {
      // The token goes in a header so it never shows up in URLs or logs.
      return await http.getJson(`${PRICES_URL}?${params}`, { headers: { 'X-Access-Token': token } });
    } catch (err) {
      if (err instanceof HttpError && (err.status === 401 || err.status === 403)) throw new TravelpayoutsAuthError();
      throw err;
    }
  }

  async function fetchTrips({ origin, fromIso, toIso, minNights, maxNights, directOnly }) {
    const trips = [];
    for (const month of departureMonths(fromIso, toIso)) {
      const body = await fetchPrices({ origin, month, directOnly });
      trips.push(...parsePrices(body, { fromIso, toIso, minNights, maxNights, marker }));
    }
    return trips;
  }

  return { fetchPrices, fetchTrips };
}
