// -----------------------------------------------------------------------------
// Handlers of the manifest surfaces: Configuration buttons (`actions`), scene
// actions (`scene_actions`) and the dashboard widget (`widgets`).
//
// Kept out of index.js so they can be unit-tested with a fake SDK object.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { getConfiguredRoutes } from './config.js';
import { findRouteByDeviceId } from './devices/index.js';
import { fetchRoute } from './mapbox.js';
import { TRAFFIC_LEVEL_LABELS, formatSummary } from './traffic.js';
import { buildWidgetContent } from './widget.js';

const logger = createLogger({ name: 'handlers' });

// Sample route used to check the token when no route is configured yet
// (Paris: Eiffel Tower -> Louvre).
const SAMPLE_ROUTE = {
  origin: { latitude: 48.8584, longitude: 2.2945 },
  destination: { latitude: 48.8606, longitude: 2.3376 },
};

const WIDGET_TTL_SECONDS = 60;

const NO_TOKEN = {
  en: 'Fill in your Mapbox access token first.',
  fr: "Renseignez d'abord votre jeton d'accès Mapbox.",
};

/**
 * @param {object} deps
 * @param {object} deps.gladys
 * @param {ReturnType<import('./monitor.js').createTrafficMonitor>} deps.monitor
 * @param {() => object} deps.getConfig
 */
export function createHandlers({ gladys, monitor, getConfig }) {
  function requireRoute(deviceExternalId) {
    const route = findRouteByDeviceId(gladys, getConfig(), deviceExternalId);
    if (!route) throw new Error(`Unknown route: ${deviceExternalId}`);
    return route;
  }

  return {
    actions: {
      async test_connection() {
        const config = getConfig();
        if (!config.access_token) return NO_TOKEN;
        const [route] = getConfiguredRoutes(config);
        if (!route) {
          const sample = await fetchRoute({ accessToken: config.access_token, ...SAMPLE_ROUTE });
          return {
            en: `Mapbox OK (sample route in Paris: ${Math.round(sample.duration / 60)} min). Now configure your routes.`,
            fr: `Mapbox OK (trajet d'exemple dans Paris : ${Math.round(sample.duration / 60)} min). Configurez maintenant vos trajets.`,
          };
        }
        const { analysis, origin, destination } = await monitor.computeRoute(route, config);
        const label = (place) => place.label;
        return {
          en: `Mapbox OK — ${route.name} (${label(origin)} → ${label(destination)}): ${formatSummary(analysis, 'en')}, usual ${Math.round(analysis.typicalMinutes)} min.`,
          fr: `Mapbox OK — ${route.name} (${label(origin)} → ${label(destination)}) : ${formatSummary(analysis, 'fr')}, habituellement ${Math.round(analysis.typicalMinutes)} min.`,
        };
      },

      async refresh_now() {
        const config = getConfig();
        if (!config.access_token) return NO_TOKEN;
        if (monitor.monitoredRoutes(config).length === 0) {
          return {
            en: 'No route device created yet: add your routes from the Discovery tab.',
            fr: "Aucun appareil trajet créé : ajoutez vos trajets depuis l'onglet Découverte.",
          };
        }
        const { refreshed, errors } = await monitor.refreshAll({ force: true });
        if (errors.length > 0) {
          throw new Error(`${errors.length} route(s) failed: ${errors[0].message}`);
        }
        return {
          en: `${refreshed} route(s) refreshed.`,
          fr: `${refreshed} trajet(s) actualisé(s).`,
        };
      },
    },

    sceneActions: {
      // A scene asks for the live travel time (e.g. every weekday at 7:30,
      // then "send a message: {{...duration_minutes}} min to work"). It only
      // computes: no state published, no scene event fired (no loops).
      async get_travel_time(fields) {
        const config = getConfig();
        const route = requireRoute(fields.route);
        const { analysis } = await monitor.computeRoute(route, config);
        return {
          route_name: route.name,
          duration_minutes: analysis.durationMinutes,
          typical_minutes: analysis.typicalMinutes,
          delay_minutes: analysis.delayMinutes,
          distance_km: analysis.distanceKm,
          traffic_level: analysis.level,
          traffic_status: TRAFFIC_LEVEL_LABELS[analysis.levelKey][config.language],
          traffic_jam: analysis.trafficJam,
          abnormal: analysis.abnormal,
          via: analysis.via,
          summary: formatSummary(analysis, config.language),
        };
      },
    },

    async widgetGet({ settings = {}, language }) {
      const config = getConfig();
      const deviceExternalId = settings.route;
      const route = deviceExternalId
        ? findRouteByDeviceId(gladys, config, deviceExternalId)
        : undefined;
      let result = route ? monitor.lastResult(route.id) : undefined;
      // Nothing refreshed yet (outside the active window, just restarted…):
      // compute it now so the status is not empty.
      if (route && !result && config.access_token) {
        try {
          result = await monitor.computeRoute(route, config);
        } catch (err) {
          logger.warn(`Widget: live computation of "${route.name}" failed: ${err.message}`);
        }
      }
      return buildWidgetContent({
        deviceExternalId,
        route,
        result,
        interval: settings.interval,
        language,
        timezone: config.timezone,
        ttlSeconds: WIDGET_TTL_SECONDS,
      });
    },

    async widgetAction(actionKey, _params, { settings = {} } = {}) {
      if (actionKey !== 'refresh') throw new Error(`Unknown widget action: ${actionKey}`);
      const config = getConfig();
      if (!config.access_token) return NO_TOKEN;
      const route = requireRoute(settings.route);
      const { analysis } = await monitor.refreshRoute(route);
      return { en: formatSummary(analysis, 'en'), fr: formatSummary(analysis, 'fr') };
    },
  };
}
