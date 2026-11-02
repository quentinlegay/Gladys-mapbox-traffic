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
    const jam = { fr: 'Embouteillage', en: 'Traffic jam', de: 'Stau', es: 'Atasco' };
    for (const language of ['fr', 'en', 'de', 'es', 'it']) {
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
      // An unsupported language falls back to English.
      assert.equal(status.items[0].value, jam[language] ?? jam.en);
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

test('test_connection lists the waypoints of the route', async () => {
  const { handlers } = setup({ route_1_via: '48.87, 2.30' });
  const fetchMock = mockFetch(() => directionsResponse(jamRoute()));
  try {
    const message = await handlers.actions.test_connection();
    assert.match(message.en, / → 48\.87, 2\.30 → /);
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

// --- "travel_times" widget ---------------------------------------------------

function setupList({ now = new Date('2026-11-02T07:40:00Z'), ...rawConfig } = {}) {
  const config = normalizeConfig({
    access_token: 'pk.test',
    route_1_name: 'Travail',
    route_1_origin: '48.8566, 2.3522',
    route_1_via: '48.87, 2.30',
    route_1_destination: '48.8924, 2.2369',
    route_2_name: 'École',
    route_2_origin: '48.8566, 2.3522',
    route_2_destination: '48.85, 2.35',
    route_3_name: 'Pas créé',
    route_3_destination: '48.80, 2.30',
    ...rawConfig,
  });
  // Route 3 is configured but its device was not created: never listed.
  const gladys = createFakeGladys({
    devices: [{ external_id: ROUTE_DEVICE }, { external_id: ROUTE_2_DEVICE }],
  });
  const getConfig = () => config;
  const monitor = createTrafficMonitor({ gladys, getConfig, now: () => now });
  const handlers = createHandlers({ gladys, monitor, getConfig, now: () => now });
  return { gladys, monitor, handlers };
}

const ROUTE_2_DEVICE = 'ext:mapbox-traffic:route:route-2';

// Route 1 is jammed (+15 min), route 2 is fluid.
function serveListRoutes() {
  return mockFetch((url) =>
    directionsResponse(
      url.pathname.includes('2.350000,48.850000')
        ? directionsRoute({ duration: 600, typical: 600 })
        : jamRoute(),
    ),
  );
}

test('the travel_times widget lists the created routes as valid cards', async () => {
  const { handlers } = setupList();
  const fetchMock = serveListRoutes();
  try {
    for (const language of ['fr', 'en', 'de', 'es', 'it']) {
      const content = await handlers.listWidgetGet({ settings: {}, language });
      assert.deepEqual(validateWidgetContent(content), []);
    }
    const content = await handlers.listWidgetGet({ settings: {}, language: 'fr' });
    const [caption, list, button] = content.components;
    assert.equal(caption.text, "Mis à jour à l'instant");
    assert.deepEqual(
      list.items.map((item) => [item.title, item.subtitle, item.badge.text, item.badge.color]),
      [
        ['Travail', '40 min · 20 km · par A86, A1', '+15 min', 'danger'],
        ['École', '10 min · 20 km · par A86, A1', "À l'heure", 'success'],
      ],
    );
    assert.match(
      list.items[0].description,
      /^48\.8566, 2\.3522 → 48\.87, 2\.30 → 48\.8924, 2\.2369\n/,
    );
    assert.match(list.items[0].description, /Retard : \+15 min \(\+60 %\)/);
    assert.equal(
      list.items[0].links[0].url,
      'https://www.google.com/maps/dir/?api=1&origin=48.8566%2C2.3522' +
        '&destination=48.8924%2C2.2369&travelmode=driving&waypoints=48.87%2C2.3',
    );
    assert.deepEqual(button.action, {
      key: 'refresh_all',
      params: { routes: [ROUTE_DEVICE, ROUTE_2_DEVICE] },
    });
  } finally {
    fetchMock.restore();
  }
});

test('the travel_times widget shows only the picked routes', async () => {
  const { handlers } = setupList();
  const fetchMock = serveListRoutes();
  try {
    for (const routes of [[ROUTE_2_DEVICE], ROUTE_2_DEVICE]) {
      const content = await handlers.listWidgetGet({ settings: { routes }, language: 'en' });
      const list = content.components.find((c) => c.type === 'card-list');
      assert.deepEqual(
        list.items.map((item) => item.title),
        ['École'],
      );
    }
  } finally {
    fetchMock.restore();
  }
});

test('the travel_times widget explains an empty list, and a route Mapbox failed on', async () => {
  const { handlers } = setupList({ route_1_destination: '', route_2_destination: '' });
  const empty = await handlers.listWidgetGet({ settings: {}, language: 'fr' });
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.match(empty.components[0].text, /Aucun trajet/);

  const failing = setupList();
  const fetchMock = mockFetch(() => ({ status: 500, body: {} }));
  try {
    const content = await failing.handlers.listWidgetGet({ settings: {}, language: 'fr' });
    assert.deepEqual(validateWidgetContent(content), []);
    const list = content.components.find((c) => c.type === 'card-list');
    assert.deepEqual(list.items[0].badge, { text: 'Pas de relevé', color: 'neutral' });
    assert.equal(content.components[0].text, 'Pas encore actualisé');
  } finally {
    fetchMock.restore();
  }
});

test('"Refresh all" refreshes the listed routes and toasts the count', async () => {
  const { gladys, handlers } = setupList();
  const fetchMock = serveListRoutes();
  try {
    const toast = await handlers.listWidgetAction('refresh_all', {
      routes: [ROUTE_DEVICE, ROUTE_2_DEVICE, 'ext:mapbox-traffic:route:route-3'],
    });
    assert.equal(toast.fr, '2 trajet(s) actualisé(s).');
  } finally {
    fetchMock.restore();
  }
  const devices = new Set(
    gladys.published.map((p) => p.featureExternalId.split(':').slice(0, 4).join(':')),
  );
  assert.deepEqual([...devices].sort(), [ROUTE_DEVICE, ROUTE_2_DEVICE]);
  await assert.rejects(() => handlers.listWidgetAction('nope', {}), /Unknown widget action/);
});

test('"Refresh all" fails only when every route fails', async () => {
  const { handlers } = setupList();
  const fetchMock = mockFetch(() => ({ status: 500, body: {} }));
  try {
    await assert.rejects(() => handlers.listWidgetAction('refresh_all', {}), /Mapbox HTTP 500/);
  } finally {
    fetchMock.restore();
  }
});

test('the travel_times details name the home when the origin is empty', async () => {
  const { monitor, handlers } = setupList({ route_1_origin: '' });
  monitor.setHome({ latitude: 48.8566, longitude: 2.3522 });
  const fetchMock = serveListRoutes();
  try {
    const content = await handlers.listWidgetGet({ settings: {}, language: 'fr' });
    const list = content.components.find((c) => c.type === 'card-list');
    assert.match(list.items[0].description, /^Maison → 48\.87, 2\.30 → /);
  } finally {
    fetchMock.restore();
  }
});
