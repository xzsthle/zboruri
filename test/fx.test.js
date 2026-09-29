import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchEurRates, toEur } from '../src/fx.js';

test('toEur converts using EUR-based rates and rounds to cents', () => {
  assert.equal(toEur(679, 'MDL', { EUR: 1, MDL: 20.15425 }), 33.69);
  assert.equal(toEur(19.99, 'EUR', { EUR: 1 }), 19.99);
});

test('toEur throws for a currency without a rate', () => {
  assert.throws(() => toEur(100, 'XYZ', { EUR: 1 }), /No exchange rate for XYZ/);
});

test('fetchEurRates returns the rates with EUR pinned to 1', async () => {
  const rates = await fetchEurRates(async () => ({ result: 'success', rates: { MDL: 20, EUR: 0.99 } }));
  assert.deepEqual(rates, { MDL: 20, EUR: 1 });
});

test('fetchEurRates rejects an unexpected response', async () => {
  await assert.rejects(fetchEurRates(async () => ({ result: 'error' })), /unexpected response/);
});
