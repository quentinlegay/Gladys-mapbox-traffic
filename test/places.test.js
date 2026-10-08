import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCoordinates, createPlaceResolver } from '../src/places.js';
import { geocodingResponse, mockFetch } from './helpers/mapboxFixtures.js';

test('parseCoordinates reads "latitude, longitude"', () => {
  assert.deepEqual(parseCoordinates('48.8566, 2.3522'), { latitude: 48.8566, longitude: 2.3522 });
  assert.deepEqual(parseCoordinates('-33.9 18.4'), { latitude: -33.9, longitude: 18.4 });
  assert.equal(parseCoordinates('10 rue de Rivoli, Paris'), null);
  assert.equal(parseCoordinates('95, 2'), null);
});

test('the resolver geocodes an address once and caches it', async () => {
  const fetchMock = mockFetch(() => geocodingResponse(2.35, 48.86, 'Rue de Rivoli, Paris'));
  try {
    const resolver = createPlaceResolver();
    const options = { accessToken: 'pk.test', home: { latitude: 48.8, longitude: 2.3 } };
    const first = await resolver.resolve('Rue de Rivoli, Paris', options);
    const second = await resolver.resolve('rue de rivoli, paris ', options);
    assert.deepEqual(first, { latitude: 48.86, longitude: 2.35, label: 'Rue de Rivoli, Paris' });
    assert.deepEqual(second, first);
    assert.equal(fetchMock.calls.length, 1);
    assert.match(fetchMock.calls[0], /proximity=2\.300000%2C48\.800000/);
  } finally {
    fetchMock.restore();
  }
});

test('the resolver does not cache a failed lookup', async () => {
  let fail = true;
  const fetchMock = mockFetch(() =>
    fail ? { status: 503, body: {} } : geocodingResponse(1, 2, 'Somewhere'),
  );
  try {
    const resolver = createPlaceResolver();
    await assert.rejects(() => resolver.resolve('Somewhere', { accessToken: 'pk' }), /HTTP 503/);
    fail = false;
    assert.equal((await resolver.resolve('Somewhere', { accessToken: 'pk' })).latitude, 2);
  } finally {
    fetchMock.restore();
  }
});
