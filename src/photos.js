// Destination photos from Pexels. The API key stays on the scanner (a GitHub secret); the website only gets
// image URLs and photographer credits in docs/data/photos.json. Photos are cached there, so after the
// first run only new destinations cost an API request.

import { HttpError } from './http.js';

const SEARCH_URL = 'https://api.pexels.com/v1/search';
const IMAGE_HOST = 'https://images.pexels.com/';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PER_PAGE = 8;
const MAX_NEW_PER_RUN = 60; // Pexels allows 200 requests an hour

// Airports named after a nearby place: search the city people actually visit.
const CITY_FOR_AIRPORT = {
  LTN: 'London', LGW: 'London', STN: 'London', BGY: 'Bergamo Italy', MXP: 'Milan', BVA: 'Paris', CRL: 'Brussels',
  WMI: 'Warsaw', OTP: 'Bucharest', HHN: 'Frankfurt', FMM: 'Munich', FCO: 'Rome', CIA: 'Rome', TSF: 'Venice', SAW: 'Istanbul', MLH: 'Basel', EIN: 'Eindhoven', NYO: 'Stockholm', TRF: 'Oslo', GHV: 'Brasov',
};

export const emptyPhotos = () => ({ version: 1, destinations: {} });

export function normalizePhotos(raw) {
  const destinations = raw?.destinations;
  const isValid = destinations !== null && typeof destinations === 'object' && !Array.isArray(destinations);
  return isValid ? { version: 1, destinations: { ...destinations } } : emptyPhotos();
}

export function photoQuery(dest) {
  const override = CITY_FOR_AIRPORT[dest.iata];
  if (override) return `${override} city`;
  const city = dest.name.split(/[/(]/)[0].trim();
  return `${city} ${dest.country} city`;
}

/** The subset of a Pexels photo the website needs; null for anything not served from Pexels' image host. */
export function toPhoto(photo) {
  const base = photo?.src?.original;
  if (typeof base !== 'string' || !base.startsWith(IMAGE_HOST)) return null;
  return {
    id: photo.id,
    base,
    avgColor: HEX_COLOR.test(photo.avg_color ?? '') ? photo.avg_color : null,
    alt: typeof photo.alt === 'string' ? photo.alt.slice(0, 200) : '',
    photographer: String(photo.photographer ?? 'Pexels').slice(0, 80),
    photographerUrl: typeof photo.photographer_url === 'string' && photo.photographer_url.startsWith('https://www.pexels.com/') ? photo.photographer_url : null,
    pageUrl: typeof photo.url === 'string' && photo.url.startsWith('https://www.pexels.com/') ? photo.url : null,
  };
}

/** First landscape photo no other destination uses yet. */
export function pickPhoto(photos, usedIds) {
  return photos.find((photo) => photo.width > photo.height && !usedIds.has(photo.id) && toPhoto(photo)) ?? null;
}

export function createPexelsClient(http, { apiKey }) {
  return {
    async search(query) {
      const params = new URLSearchParams({ query, orientation: 'landscape', per_page: String(PER_PAGE) });
      try {
        const body = await http.getJson(`${SEARCH_URL}?${params}`, { headers: { Authorization: apiKey } });
        return Array.isArray(body?.photos) ? body.photos : [];
      } catch (err) {
        if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
          const auth = new Error('Pexels rejected the API key — check the PEXELS_API_KEY secret');
          auth.auth = true;
          throw auth;
        }
        throw err;
      }
    },
  };
}

/** Adds photos for destinations that don't have one yet; a failed search just leaves that one out. */
export async function updatePhotos({ pexels, destinations, existing, log, pause }) {
  const found = { ...existing.destinations };
  const used = new Set(Object.values(found).map((photo) => photo.id));
  const missing = destinations.filter((dest) => !found[dest.iata]).slice(0, MAX_NEW_PER_RUN);

  for (const dest of missing) {
    try {
      const photo = pickPhoto(await pexels.search(photoQuery(dest)), used);
      if (photo) {
        found[dest.iata] = toPhoto(photo);
        used.add(photo.id);
      }
      await pause();
    } catch (err) {
      log.warn(`Photo for ${dest.iata} skipped — ${err.message}`);
      if (err.auth) break;
    }
  }
  if (missing.length > 0) log.info(`Photos: ${Object.keys(found).length - Object.keys(existing.destinations).length} new from Pexels`);
  return { ...existing, destinations: found };
}
