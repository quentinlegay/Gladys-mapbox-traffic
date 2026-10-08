// -----------------------------------------------------------------------------
// Traffic monitor: refreshes the routes, publishes their states and fires the
// scene triggers on every transition (traffic jam started / ended, abnormal
// travel time started / ended).
//
// It holds the only runtime state of the integration (last results, current
// transitions, caches), in memory: everything is recomputed after a restart.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { getConfiguredRoutes } from './config.js';
import { fetchRoute } from './mapbox.js';
import { createPlaceResolver } from './places.js';
import { analyzeRoute, formatSummary } from './traffic.js';
import { buildRouteStates, routeIds } from './devices/route.js';
import { isWithinActiveWindow } from './schedule.js';

const logger = createLogger({ name: 'traffic-monitor' });

// The free-flow duration (fallback when Mapbox has no typical duration for a
// road) barely changes: fetch it at most once a day per route.
const FREE_FLOW_TTL_MS = 24 * 60 * 60 * 1000;

// Scene trigger keys declared in the manifest `scene_triggers`. Never rename.
export const SCENE_EVENTS = {
  TRAFFIC_JAM_STARTED: 'traffic_jam_started',
  TRAFFIC_JAM_ENDED: 'traffic_jam_ended',
  ABNORMAL_DURATION_STARTED: 'abnormal_duration_started',
  ABNORMAL_DURATION_ENDED: 'abnormal_duration_ended',
};

/**
 * Flat scene event data (≤ 30 primitive keys). `route` is the device
 * external_id: the trigger's `source: "devices"` filter compares it.
 */
export function buildEventData(gladys, route, analysis, language) {
  return {
    route: routeIds(gladys, route).device,
    route_name: route.name,
    level: analysis.levelKey,
    duration_minutes: analysis.durationMinutes,
    typical_minutes: analysis.typicalMinutes,
    delay_minutes: analysis.delayMinutes,
    delay_percent: analysis.delayPercent,
    congestion_percent: analysis.congestionPercent,
    distance_km: analysis.distanceKm,
    via: analysis.via,
    summary: formatSummary(analysis, language),
  };
}

/**
 * Which scene events a new analysis fires, given the previous transition
 * state of the route (undefined on the first refresh = everything "normal").
 */
export function detectTransitions(previous = { trafficJam: false, abnormal: false }, analysis) {
  const events = [];
  if (analysis.trafficJam && !previous.trafficJam) events.push(SCENE_EVENTS.TRAFFIC_JAM_STARTED);
  if (!analysis.trafficJam && previous.trafficJam) events.push(SCENE_EVENTS.TRAFFIC_JAM_ENDED);
  if (analysis.abnormal && !previous.abnormal) events.push(SCENE_EVENTS.ABNORMAL_DURATION_STARTED);
  if (!analysis.abnormal && previous.abnormal) events.push(SCENE_EVENTS.ABNORMAL_DURATION_ENDED);
  return events;
}

/**
 * @param {object} deps
 * @param {object} deps.gladys the SDK instance
 * @param {() => object} deps.getConfig current normalized configuration
 * @param {(error: Error | null) => void} [deps.onRefreshResult] called after
 *   each refresh round (null when every route succeeded), to report the
 *   connection status
 * @param {() => Date} [deps.now]
 */
export function createTrafficMonitor({ gladys, getConfig, onRefreshResult = () => {}, now }) {
  const clock = now ?? (() => new Date());
  const places = createPlaceResolver();
  const lastResults = new Map(); // route.id -> { analysis, updatedAt, origin, destination }
  const transitions = new Map(); // route.id -> { trafficJam, abnormal }
  const freeFlow = new Map(); // "origin;destination;avoid" -> { seconds, fetchedAt }
  let home = null;
  let timer = null;

  async function resolveEndpoints(route, config) {
    const options = { accessToken: config.access_token, language: config.language, home };
    if (!route.origin && !home) {
      throw new Error(
        `"${route.name}": no origin configured and the home has no location in Gladys`,
      );
    }
    const origin = route.origin
      ? await places.resolve(route.origin, options)
      : { ...home, label: 'home' };
    const destination = await places.resolve(route.destination, options);
    return { origin, destination };
  }

  async function freeFlowSeconds(origin, destination, config) {
    const key = [origin.latitude, origin.longitude, destination.latitude, destination.longitude]
      .concat(config.avoid)
      .join(';');
    const cached = freeFlow.get(key);
    if (cached && clock() - cached.fetchedAt < FREE_FLOW_TTL_MS) return cached.seconds;
    const route = await fetchRoute({
      accessToken: config.access_token,
      origin,
      destination,
      profile: 'driving',
      exclude: config.avoid,
      congestion: false,
    });
    freeFlow.set(key, { seconds: route.duration, fetchedAt: clock() });
    return route.duration;
  }

  /**
   * Query Mapbox for one route and analyse it. No side effect on Gladys.
   */
  async function computeRoute(route, config = getConfig()) {
    if (!config.access_token) throw new Error('No Mapbox access token configured');
    const { origin, destination } = await resolveEndpoints(route, config);
    const mapboxRoute = await fetchRoute({
      accessToken: config.access_token,
      origin,
      destination,
      exclude: config.avoid,
    });
    const fallbackTypicalSeconds = Number.isFinite(mapboxRoute.duration_typical)
      ? undefined
      : await freeFlowSeconds(origin, destination, config);
    const analysis = analyzeRoute(mapboxRoute, { fallbackTypicalSeconds, thresholds: config });
    const result = { analysis, updatedAt: clock(), origin, destination };
    lastResults.set(route.id, result);
    return result;
  }

  /**
   * Refresh one route: query Mapbox, publish the states and, when
   * `fireEvents` is set, the scene events of the transitions.
   */
  async function refreshRoute(route, { fireEvents = true } = {}) {
    const config = getConfig();
    const result = await computeRoute(route, config);
    const { analysis } = result;
    logger.info(
      `${route.name}: ${analysis.durationMinutes} min (usual ${analysis.typicalMinutes}, ` +
        `${analysis.levelKey}, ${analysis.congestionPercent}% congested)`,
    );
    await gladys.publishStates(buildRouteStates(gladys, route, analysis, config));

    if (fireEvents) {
      const events = detectTransitions(transitions.get(route.id), analysis);
      transitions.set(route.id, { trafficJam: analysis.trafficJam, abnormal: analysis.abnormal });
      const data = buildEventData(gladys, route, analysis, config.language);
      for (const event of events) {
        logger.info(`${route.name}: scene event ${event}`);
        await gladys.publishSceneEvent(event, data);
      }
    }
    return result;
  }

  /**
   * Routes whose device the user created in Gladys: the others have nowhere
   * to publish their states.
   */
  function monitoredRoutes(config = getConfig()) {
    const created = new Set((gladys.devices ?? []).map((d) => d.external_id));
    return getConfiguredRoutes(config).filter((route) =>
      created.has(routeIds(gladys, route).device),
    );
  }

  async function refreshAll({ force = false } = {}) {
    const config = getConfig();
    if (!config.access_token) return { refreshed: 0, errors: [] };
    if (!force && !isWithinActiveWindow(config, clock())) {
      logger.debug('Outside the active window: no refresh');
      return { refreshed: 0, errors: [], skipped: true };
    }
    const errors = [];
    let refreshed = 0;
    for (const route of monitoredRoutes(config)) {
      try {
        await refreshRoute(route);
        refreshed += 1;
      } catch (err) {
        logger.error(`Refresh of "${route.name}" failed: ${err.message}`);
        errors.push(err);
      }
    }
    onRefreshResult(errors[0] ?? null);
    return { refreshed, errors };
  }

  return {
    computeRoute,
    refreshRoute,
    refreshAll,
    monitoredRoutes,

    lastResult(routeId) {
      return lastResults.get(routeId);
    },

    setHome(location) {
      home =
        location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
          ? { latitude: location.latitude, longitude: location.longitude }
          : null;
    },

    /**
     * Forget everything derived from the configuration (addresses, routes).
     * The transitions are kept: a jam in progress must not fire its
     * "started" event a second time because a threshold was edited.
     */
    reset() {
      places.clear();
      lastResults.clear();
      freeFlow.clear();
    },

    start() {
      this.stop();
      const run = () => refreshAll().catch((err) => logger.error('Refresh round failed', err));
      run();
      timer = setInterval(run, getConfig().poll_frequency * 1000);
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
