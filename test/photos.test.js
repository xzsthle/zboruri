import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPexelsClient, emptyPhotos, normalizePhotos, photoQuery, pickPhoto, toPhoto, updatePhotos } from '../src/photos.js';
import { HttpError } from '../src/http.js';

const pexelsPhoto = (id, extra = {}) => ({
  id,
  width: 6000,
  height: 4000,
  url: `https://www.pexels.com/photo/view-${id}/`,
  photographer: 'Ana Pop',
  photographer_url: 'https://www.pexels.com/@ana',
  avg_color: '#6D7A8B',
  alt: 'Old town at sunset',
  src: { original: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg` },
  ...extra,
});
const quiet = { info() {}, warn() {} };

test('photoQuery searches the city, not the airport', () => {
  assert.equal(photoQuery({ iata: 'SOF', name: 'Sofia', country: 'Bulgaria' }), 'Sofia Bulgaria city');
  assert.equal(photoQuery({ iata: 'LTN', name: 'London Luton', country: 'United Kingdom' }), 'London city');
  assert.equal(photoQuery({ iata: 'FMM', name: 'Memmingen / Munich West', country: 'Germany' }), 'Munich city');
  assert.equal(photoQuery({ iata: 'XXX', name: 'Somewhere (North)', country: 'Utopia' }), 'Somewhere Utopia city');
});

test('toPhoto keeps what the site needs and rejects images from other hosts', () => {
  assert.deepEqual(toPhoto(pexelsPhoto(7)), {
    id: 7,
    base: 'https://images.pexels.com/photos/7/pexels-photo-7.jpeg',
    avgColor: '#6D7A8B',
    alt: 'Old town at sunset',
    photographer: 'Ana Pop',
    photographerUrl: 'https://www.pexels.com/@ana',
    pageUrl: 'https://www.pexels.com/photo/view-7/',
  });
  assert.equal(toPhoto(pexelsPhoto(8, { src: { original: 'https://evil.test/x.jpg' } })), null);
  assert.equal(toPhoto(pexelsPhoto(9, { avg_color: 'red; background:url(x)' })).avgColor, null);
});

test('pickPhoto prefers landscape shots not already used by another destination', () => {
  const photos = [pexelsPhoto(1), pexelsPhoto(2, { width: 3000, height: 4500 }), pexelsPhoto(3)];
  assert.equal(pickPhoto(photos, new Set()).id, 1);
  assert.equal(pickPhoto(photos, new Set([1])).id, 3);
  assert.equal(pickPhoto(photos, new Set([1, 3])), null);
});

test('the client sends the key as the Authorization header and asks for landscape photos', async () => {
  let request;
  const http = { getJson: async (url, init) => { request = { url, init }; return { photos: [pexelsPhoto(1)] }; } };
  const photos = await createPexelsClient(http, { apiKey: 'secret-key' }).search('Sofia Bulgaria city');
  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, 'https://api.pexels.com/v1/search');
  assert.equal(url.searchParams.get('query'), 'Sofia Bulgaria city');
  assert.equal(url.searchParams.get('orientation'), 'landscape');
  assert.doesNotMatch(request.url, /secret-key/);
  assert.equal(request.init.headers.Authorization, 'secret-key');
  assert.equal(photos.length, 1);
});

test('the client explains a rejected key without echoing it', async () => {
  const http = { getJson: async (url) => { throw new HttpError(401, url, 'Unauthorized'); } };
  await assert.rejects(createPexelsClient(http, { apiKey: 'secret-key' }).search('x'), (err) => {
    assert.match(err.message, /Pexels rejected the API key/);
    assert.doesNotMatch(err.message, /secret-key/);
    return true;
  });
});

test('updatePhotos only fetches destinations without a photo and keeps going past failures', async () => {
  const searched = [];
  const pexels = {
    search: async (query) => {
      searched.push(query);
      if (query.startsWith('Budapest')) throw new Error('HTTP 500');
      return [pexelsPhoto(query.startsWith('Sofia') ? 11 : 12)];
    },
  };
  const existing = { version: 1, destinations: { BGY: toPhoto(pexelsPhoto(10)) } };
  const destinations = [
    { iata: 'BGY', name: 'Milan Bergamo', country: 'Italy' },
    { iata: 'SOF', name: 'Sofia', country: 'Bulgaria' },
    { iata: 'BUD', name: 'Budapest', country: 'Hungary' },
    { iata: 'VCE', name: 'Venice', country: 'Italy' },
  ];
  const next = await updatePhotos({ pexels, destinations, existing, log: quiet, pause: async () => {} });
  assert.deepEqual(searched, ['Sofia Bulgaria city', 'Budapest Hungary city', 'Venice Italy city']);
  assert.deepEqual(Object.keys(next.destinations).sort(), ['BGY', 'SOF', 'VCE']);
  assert.equal(next.destinations.SOF.id, 11);
  assert.equal(existing.destinations.SOF, undefined, 'input must not be mutated');
});

test('updatePhotos stops early when the key is rejected', async () => {
  let calls = 0;
  const pexels = { search: async () => { calls += 1; const err = new Error('Pexels rejected the API key'); err.auth = true; throw err; } };
  const destinations = [{ iata: 'SOF', name: 'Sofia', country: 'Bulgaria' }, { iata: 'BUD', name: 'Budapest', country: 'Hungary' }];
  const next = await updatePhotos({ pexels, destinations, existing: emptyPhotos(), log: quiet, pause: async () => {} });
  assert.equal(calls, 1);
  assert.deepEqual(next, emptyPhotos());
});

test('normalizePhotos keeps valid files and resets anything else', () => {
  assert.deepEqual(normalizePhotos({ version: 1, destinations: { SOF: { id: 1 } } }), { version: 1, destinations: { SOF: { id: 1 } } });
  assert.deepEqual(normalizePhotos([]), emptyPhotos());
});
