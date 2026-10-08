import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createHandlers } from '../src/handlers.js';
import { createTrafficMonitor } from '../src/monitor.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { directionsResponse, directionsRoute, mockFetch } from './helpers/mapboxFixtures.js';

const ROUTE_DEVICE = 'ext:mapbox-traffic:route:route-1';

function setup(rawConfig = {}) {
  const config = normalizeConfig({
    access_token: 'pk.test',
    route_1_name: 'Travail',
    route_1_origin: '48.8566, 2.3522',
    route_1_destination: '48.8924, 2.2369',
    ...rawConfig,
  });
  const gladys = createFakeGladys({ devices: [{ external_id: ROUTE_DEVICE }] });
  const getConfig = () => config;
  const monitor = createTrafficMonitor({ gladys, getConfig });
  return { gladys, monitor, handlers: createHandlers({ gladys, monitor, getConfig }) };
}

const jamRoute = () =>
  directionsRoute({
    duration: 2400,
    typical: 1500,
    congestion: [...Array(16).fill('low'), ...Array(4).fill('heavy')],
  });

test('get_travel_time returns the declared outputs and fires no event', async () => {
  const { gladys, handlers } = setup();
  const fetchMock = mockFetch(() => directionsResponse(jamRoute()));
  try {
    const outputs = await handlers.sceneActions.get_travel_time({ route: ROUTE_DEVICE });
    assert.deepEqual(outputs, {
      route_name: 'Travail',
      duration_minutes: 40,
      typical_minutes: 25,
      delay_minutes: 15,
      distance_km: 20,
      traffic_level: 2,
      traffic_status: 'Embouteillage',
      traffic_jam: true,
      abnormal: true,
      via: 'A86, A1',
      summary: '40 min (+15 min) · Embouteillage',
    });
  } finally {
    fetchMock.restore();
  }
  assert.equal(gladys.sceneEvents.length, 0, 'a scene action never fires an event');
});

test('get_travel_time rejects an unknown route', async () => {
  const { handlers } = setup();
  await assert.rejects(
    () => handlers.sceneActions.get_travel_time({ route: 'nope' }),
    /Unknown route/,
  );
});

test('the widget content is valid for the core vocabulary', async () => {
  const { handlers } = setup();
  const fetchMock = mockFetch(() => directionsResponse(jamRoute()));
  try {
    for (const language of ['fr', 'en']) {
      const content = await handlers.widgetGet({
        settings: { route: ROUTE_DEVICE, interval: 'last-week' },
        language,
      });
      assert.deepEqual(validateWidgetContent(content), []);
      const chart = content.components.find((c) => c.type === 'chart');
      assert.deepEqual(chart.device_features, [
        `${ROUTE_DEVICE}:duration`,
        `${ROUTE_DEVICE}:typical-duration`,
      ]);
      assert.equal(chart.interval, 'last-week');
      const status = content.components.find((c) => c.type === 'status');
      assert.equal(status.items[0].value, language === 'fr' ? 'Embouteillage' : 'Traffic jam');
      assert.equal(status.items[0].color, 'danger');
    }
  } finally {
    fetchMock.restore();
  }
});

test('the widget explains a missing route instead of failing', async () => {
  const { handlers } = setup();
  for (const settings of [{}, { route: 'ext:mapbox-traffic:route:route-3' }]) {
    const content = await handlers.widgetGet({ settings, language: 'fr' });
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components[0].type, 'text');
  }
});

test('the widget refresh button refreshes the route and toasts the summary', async () => {
  const { gladys, handlers } = setup();
  const fetchMock = mockFetch(() => directionsResponse(jamRoute()));
  try {
    const toast = await handlers.widgetAction('refresh', {}, { settings: { route: ROUTE_DEVICE } });
    assert.equal(toast.fr, '40 min (+15 min) · Embouteillage');
  } finally {
    fetchMock.restore();
  }
  assert.ok(gladys.published.length > 0);
});

test('the actions ask for the token first', async () => {
  const { handlers } = setup({ access_token: '' });
  assert.match((await handlers.actions.test_connection()).en, /access token/);
  assert.match((await handlers.actions.refresh_now()).en, /access token/);
});

test('test_connection describes the first route', async () => {
  const { handlers } = setup();
  const fetchMock = mockFetch(() => directionsResponse(jamRoute()));
  try {
    const message = await handlers.actions.test_connection();
    assert.match(message.fr, /Mapbox OK — Travail/);
    assert.match(message.fr, /habituellement 25 min/);
  } finally {
    fetchMock.restore();
  }
});

test('test_connection uses a sample route when none is configured', async () => {
  const { handlers } = setup({ route_1_destination: '' });
  const fetchMock = mockFetch(() => directionsResponse(directionsRoute({ duration: 600 })));
  try {
    assert.match((await handlers.actions.test_connection()).en, /sample route in Paris: 10 min/);
  } finally {
    fetchMock.restore();
  }
});

test('refresh_now refreshes the created routes', async () => {
  const { handlers } = setup();
  const fetchMock = mockFetch(() => directionsResponse(jamRoute()));
  try {
    assert.equal((await handlers.actions.refresh_now()).en, '1 route(s) refreshed.');
  } finally {
    fetchMock.restore();
  }
});
