import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrafficMonitor, detectTransitions, SCENE_EVENTS } from '../src/monitor.js';
import { normalizeConfig, getConfiguredRoutes } from '../src/config.js';
import { FEATURE } from '../src/devices/route.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { directionsResponse, directionsRoute, mockFetch } from './helpers/mapboxFixtures.js';

const ROUTE_DEVICE = 'ext:mapbox-traffic:route:route-1';

function setup({ config: rawConfig = {}, devices = [{ external_id: ROUTE_DEVICE }], now } = {}) {
  const config = normalizeConfig({
    access_token: 'pk.test',
    route_1_name: 'Travail',
    route_1_origin: '48.8566, 2.3522',
    route_1_destination: '48.8924, 2.2369',
    ...rawConfig,
  });
  const gladys = createFakeGladys({ devices });
  const monitor = createTrafficMonitor({ gladys, getConfig: () => config, now });
  const [route] = getConfiguredRoutes(config);
  return { gladys, monitor, route, config };
}

// Serve the routes in sequence; `driving` (free-flow) requests get `freeFlow`.
function serveRoutes(routes, { freeFlow = 1200 } = {}) {
  let i = 0;
  return mockFetch((url) => {
    if (url.pathname.includes('/mapbox/driving/')) {
      return directionsResponse(directionsRoute({ duration: freeFlow }));
    }
    return directionsResponse(routes[Math.min(i++, routes.length - 1)]);
  });
}

test('detectTransitions fires one event per change', () => {
  assert.deepEqual(detectTransitions(undefined, { trafficJam: false, abnormal: false }), []);
  assert.deepEqual(detectTransitions(undefined, { trafficJam: true, abnormal: true }), [
    SCENE_EVENTS.TRAFFIC_JAM_STARTED,
    SCENE_EVENTS.ABNORMAL_DURATION_STARTED,
  ]);
  assert.deepEqual(
    detectTransitions({ trafficJam: true, abnormal: true }, { trafficJam: true, abnormal: false }),
    [SCENE_EVENTS.ABNORMAL_DURATION_ENDED],
  );
  assert.deepEqual(
    detectTransitions(
      { trafficJam: true, abnormal: false },
      { trafficJam: false, abnormal: false },
    ),
    [SCENE_EVENTS.TRAFFIC_JAM_ENDED],
  );
});

test('refreshRoute publishes the states of the route device', async () => {
  const { gladys, monitor, route } = setup();
  const fetchMock = serveRoutes([directionsRoute({ duration: 1500, typical: 1500 })]);
  try {
    await monitor.refreshRoute(route);
  } finally {
    fetchMock.restore();
  }
  const states = Object.fromEntries(gladys.published.map((p) => [p.featureExternalId, p.state]));
  assert.equal(states[`${ROUTE_DEVICE}:${FEATURE.DURATION}`], 25);
  assert.equal(states[`${ROUTE_DEVICE}:${FEATURE.TYPICAL_DURATION}`], 25);
  assert.equal(states[`${ROUTE_DEVICE}:${FEATURE.DELAY}`], 0);
  assert.equal(states[`${ROUTE_DEVICE}:${FEATURE.DISTANCE}`], 20);
  assert.equal(states[`${ROUTE_DEVICE}:${FEATURE.TRAFFIC_LEVEL}`], 0);
  assert.deepEqual(states[`${ROUTE_DEVICE}:${FEATURE.TRAFFIC_STATUS}`], { text: 'Fluide' });
  assert.deepEqual(states[`${ROUTE_DEVICE}:${FEATURE.VIA}`], { text: 'A86, A1' });
  assert.equal(gladys.sceneEvents.length, 0, 'a normal trip fires nothing');
  // Coordinates given: no geocoding, and duration_typical present: no free-flow call.
  assert.equal(fetchMock.calls.length, 1);
});

test('a jam fires its "started" event once, then its "ended" event', async () => {
  const { gladys, monitor, route } = setup();
  const jam = [...Array(16).fill('low'), ...Array(4).fill('heavy')];
  const fetchMock = serveRoutes([
    directionsRoute({ duration: 2400, typical: 1500, congestion: jam }),
    directionsRoute({ duration: 2400, typical: 1500, congestion: jam }),
    directionsRoute({ duration: 1500, typical: 1500 }),
  ]);
  try {
    await monitor.refreshRoute(route);
    await monitor.refreshRoute(route);
    await monitor.refreshRoute(route);
  } finally {
    fetchMock.restore();
  }
  assert.deepEqual(
    gladys.sceneEvents.map((e) => e.key),
    [
      SCENE_EVENTS.TRAFFIC_JAM_STARTED,
      SCENE_EVENTS.ABNORMAL_DURATION_STARTED,
      SCENE_EVENTS.TRAFFIC_JAM_ENDED,
      SCENE_EVENTS.ABNORMAL_DURATION_ENDED,
    ],
  );
  const { data } = gladys.sceneEvents[0];
  assert.equal(data.route, ROUTE_DEVICE);
  assert.equal(data.route_name, 'Travail');
  assert.equal(data.level, 'heavy');
  assert.equal(data.delay_minutes, 15);
  assert.equal(data.congestion_percent, 20);
  assert.equal(data.summary, '40 min (+15 min) · Embouteillage');
  for (const value of Object.values(data)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), 'data is flat');
  }
});

test('the free-flow duration is fetched once when Mapbox has no typical duration', async () => {
  const { gladys, monitor, route } = setup();
  const fetchMock = serveRoutes([directionsRoute({ duration: 1800 })], { freeFlow: 1200 });
  try {
    await monitor.refreshRoute(route);
    await monitor.refreshRoute(route);
  } finally {
    fetchMock.restore();
  }
  assert.equal(fetchMock.calls.filter((u) => u.includes('/mapbox/driving/')).length, 1);
  const typical = gladys.published.find((p) =>
    p.featureExternalId.endsWith(`:${FEATURE.TYPICAL_DURATION}`),
  );
  assert.equal(typical.state, 20);
});

test('an empty origin starts from the home location', async () => {
  const { monitor, route } = setup({ config: { route_1_origin: '' } });
  await assert.rejects(() => monitor.computeRoute(route), /home has no location/);

  monitor.setHome({ latitude: 45.75, longitude: 4.85 });
  const fetchMock = serveRoutes([directionsRoute({ duration: 600, typical: 600 })]);
  try {
    await monitor.computeRoute(route);
  } finally {
    fetchMock.restore();
  }
  assert.match(fetchMock.calls[0], /\/4\.850000,45\.750000;/);
});

test('refreshAll only refreshes the created route devices, inside the window', async () => {
  const outside = new Date('2026-10-07T12:00:00Z'); // 14:00 in Paris
  const { gladys, monitor } = setup({
    config: { active_hours: '07:00-09:30', route_2_destination: '45.0, 5.0' },
    now: () => outside,
  });
  const fetchMock = serveRoutes([directionsRoute({ duration: 1500, typical: 1500 })]);
  try {
    assert.deepEqual(await monitor.refreshAll(), { refreshed: 0, errors: [], skipped: true });
    assert.equal(fetchMock.calls.length, 0);

    const result = await monitor.refreshAll({ force: true });
    assert.equal(result.refreshed, 1, 'route 2 has no created device');
  } finally {
    fetchMock.restore();
  }
  assert.ok(gladys.published.length > 0);
});

test('refreshAll reports the first error to onRefreshResult', async () => {
  const config = normalizeConfig({
    access_token: 'pk',
    route_1_destination: '1, 1',
    route_1_origin: '2, 2',
  });
  const gladys = createFakeGladys({ devices: [{ external_id: ROUTE_DEVICE }] });
  const reported = [];
  const monitor = createTrafficMonitor({
    gladys,
    getConfig: () => config,
    onRefreshResult: (err) => reported.push(err),
  });
  const fetchMock = mockFetch(() => ({ status: 401, body: { message: 'Invalid Token' } }));
  try {
    const { errors } = await monitor.refreshAll();
    assert.equal(errors.length, 1);
  } finally {
    fetchMock.restore();
  }
  assert.equal(reported.length, 1);
  assert.equal(reported[0].isAuthError, true);
});
