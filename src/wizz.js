// Wizz Air's public website API (the same calls wizzair.com makes). No key needed.
const SITE = 'https://www.wizzair.com';
const API = 'https://be.wizzair.com';
const API_HEADERS = { Origin: SITE, Referer: `${SITE}/`, Accept: 'application/json' };

const HH_MM = /^\d{2}:\d{2}$/;

/** The timetable endpoint rejects date ranges longer than this. */
export const MAX_WINDOW_DAYS = 42;

export function parseApiVersion(html) {
  const match = /be\.wizzair\.com\/(\d+\.\d+\.\d+)/.exec(html);
  if (!match) {
    throw new Error('Could not find the Wizz Air API version on wizzair.com (the site layout may have changed)');
  }
  return match[1];
}

const clean = (text) => String(text ?? '').trim();

const toPlace = (city) => ({
  iata: city.iata,
  name: clean(city.shortName),
  country: clean(city.countryName),
  countryCode: city.countryCode,
  lat: city.latitude ?? null,
  lon: city.longitude ?? null,
});

/** The origin plus every real airport it has a direct flight to ("All Airports" groups are fake stations). */
export function parseRouteMap(map, origin) {
  if (!Array.isArray(map?.cities)) {
    throw new Error('Wizz Air route map has an unexpected shape');
  }
  const byIata = new Map(map.cities.map((city) => [city.iata, city]));
  const home = byIata.get(origin);
  if (!home) {
    throw new Error(`Wizz Air does not list ${origin} as an airport`);
  }
  const destinations = (home.connections ?? [])
    .filter((connection) => connection.isDirectFlight)
    .map((connection) => byIata.get(connection.iata))
    .filter((city) => city && !city.isFakeStation)
    .map(toPlace)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { origin: toPlace(home), destinations };
}

/**
 * Keeps days with a real price ("checkPrice" days come back with amount 0) on exactly this airport pair:
 * asking for LGW also returns LTN flights because Wizz Air groups airports by city.
 */
export function parseFares(flights, from, to) {
  return (flights ?? [])
    .filter((flight) => flight.departureStation === from && flight.arrivalStation === to)
    .filter((flight) => flight.priceType === 'price' && flight.price?.amount > 0)
    .map((flight) => ({
      date: flight.departureDate.slice(0, 10),
      times: (flight.departureDates ?? []).map((iso) => String(iso).slice(11, 16)).filter((t) => HH_MM.test(t)),
      amount: flight.price.amount,
      currency: flight.price.currencyCode,
    }));
}

export function timetableBody(origin, dest, { from, to }) {
  return {
    flightList: [
      { departureStation: origin, arrivalStation: dest, from, to },
      { departureStation: dest, arrivalStation: origin, from, to },
    ],
    priceType: 'regular',
    adultCount: 1,
    childCount: 0,
    infantCount: 0,
  };
}

export function bookingUrl(origin, dest, outDate, backDate) {
  return `${SITE}/en-gb/booking/select-flight/${origin}/${dest}/${outDate}/${backDate}/1/0/0/null`;
}

export function createWizzClient(http) {
  return {
    getApiVersion: async () => parseApiVersion(await http.getText(`${SITE}/en-gb`)),

    getRouteMap: async (version, origin) => {
      const map = await http.getJson(`${API}/${version}/Api/asset/map?languageCode=en-gb`, { headers: API_HEADERS });
      return parseRouteMap(map, origin);
    },

    getTimetable: async (version, origin, dest, window) => {
      const data = await http.postJson(`${API}/${version}/Api/search/timetable`, timetableBody(origin, dest, window), {
        headers: API_HEADERS,
      });
      return {
        outbound: parseFares(data?.outboundFlights, origin, dest),
        inbound: parseFares(data?.returnFlights, dest, origin),
      };
    },
  };
}
