import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRoute, geocode, MapboxError } from '../src/mapbox.js';
import {
  directionsResponse,
  directionsRoute,
  geocodingResponse,
  mockFetch,
} from './helpers/mapboxFixtures.js';

const origin = { latitude: 48.8566, longitude: 2.3522 };
const destination = { latitude: 48.8924, longitude: 2.2369 };

test('fetchRoute calls driving-traffic with lon,lat coordinates and congestion', async () => {
  const route = directionsRoute({ duration: 1500, typical: 1400 });
  const fetchMock = mockFetch(() => directionsResponse(route));
  try {
    const result = await fetchRoute({
      accessToken: 'pk.test',
      origin,
      destination,
      exclude: ['toll'],
    });
    assert.deepEqual(result, route);
    const url = new URL(fetchMock.calls[0]);
    assert.equal(
      url.pathname,
      '/directions/v5/mapbox/driving-traffic/2.352200,48.856600;2.236900,48.892400',
    );
    assert.equal(url.searchParams.get('annotations'), 'congestion,distance');
    assert.equal(url.searchParams.get('overview'), 'full');
    assert.equal(url.searchParams.get('exclude'), 'toll');
    assert.equal(url.searchParams.get('access_token'), 'pk.test');
  } finally {
    fetchMock.restore();
  }
});

test('fetchRoute without congestion asks for no geometry', async () => {
  const fetchMock = mockFetch(() => directionsResponse(directionsRoute({ duration: 1 })));
  try {
    await fetchRoute({
      accessToken: 'pk',
      origin,
      destination,
      profile: 'driving',
      congestion: false,
    });
    const url = new URL(fetchMock.calls[0]);
    assert.match(url.pathname, /\/mapbox\/driving\//);
    assert.equal(url.searchParams.get('overview'), 'false');
    assert.equal(url.searchParams.get('annotations'), null);
  } finally {
    fetchMock.restore();
  }
});

test('fetchRoute reports an invalid token as an auth error', async () => {
  const fetchMock = mockFetch(() => ({
    status: 401,
    body: { message: 'Not Authorized - Invalid Token' },
  }));
  try {
    await assert.rejects(
      () => fetchRoute({ accessToken: 'bad', origin, destination }),
      (err) => err instanceof MapboxError && err.isAuthError && /Invalid Token/.test(err.message),
    );
  } finally {
    fetchMock.restore();
  }
});

test('fetchRoute throws when Mapbox finds no route', async () => {
  const fetchMock = mockFetch(() => ({ code: 'NoRoute', routes: [] }));
  try {
    await assert.rejects(
      () => fetchRoute({ accessToken: 'pk', origin, destination }),
      (err) => err.code === 'NoRoute' && !err.isAuthError,
    );
  } finally {
    fetchMock.restore();
  }
});

test('fetchRoute wraps network failures', async () => {
  const fetchMock = mockFetch(() => {
    throw new Error('ECONNRESET');
  });
  try {
    await assert.rejects(
      () => fetchRoute({ accessToken: 'pk', origin, destination }),
      /unreachable/,
    );
  } finally {
    fetchMock.restore();
  }
});

test('geocode returns the first feature', async () => {
  const fetchMock = mockFetch(() => geocodingResponse(2.29, 48.85, 'Tour Eiffel, Paris'));
  try {
    const place = await geocode({ accessToken: 'pk', query: 'Tour Eiffel', language: 'fr' });
    assert.deepEqual(place, { latitude: 48.85, longitude: 2.29, label: 'Tour Eiffel, Paris' });
    const url = new URL(fetchMock.calls[0]);
    assert.equal(url.pathname, '/search/geocode/v6/forward');
    assert.equal(url.searchParams.get('q'), 'Tour Eiffel');
  } finally {
    fetchMock.restore();
  }
});

test('geocode throws when the address is unknown', async () => {
  const fetchMock = mockFetch(() => ({ type: 'FeatureCollection', features: [] }));
  try {
    await assert.rejects(() => geocode({ accessToken: 'pk', query: 'nowhere' }), /not found/);
  } finally {
    fetchMock.restore();
  }
});
