// -----------------------------------------------------------------------------
// Handlers of the manifest surfaces: Configuration buttons (`actions`), scene
// actions (`scene_actions`) and the dashboard widget (`widgets`).
//
// Kept out of index.js so they can be unit-tested with a fake SDK object.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES, getConfiguredRoutes } from './config.js';
import { findRouteByDeviceId } from './devices/index.js';
import { routeIds } from './devices/route.js';
import { fetchRoute } from './mapbox.js';
import { isWithinActiveWindow } from './schedule.js';
import { TRAFFIC_LEVEL_LABELS, formatSummary } from './traffic.js';
import {
  buildQuotaContent,
  buildTravelTimesContent,
  buildWidgetContent,
  LIST_WIDGET_REFRESH_ACTION,
} from './widget.js';

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
  de: 'Geben Sie zuerst Ihr Mapbox-Zugriffstoken ein.',
  es: 'Introduzca primero su token de acceso de Mapbox.',
};

/**
 * @param {object} deps
 * @param {object} deps.gladys
 * @param {ReturnType<import('./monitor.js').createTrafficMonitor>} deps.monitor
 * @param {() => object} deps.getConfig
 * @param {ReturnType<import('./usage.js').createUsageCounter>} [deps.usage]
 * @param {() => Date} [deps.now]
 */
export function createHandlers({ gladys, monitor, getConfig, usage, now = () => new Date() }) {
  function requireRoute(deviceExternalId) {
    const route = findRouteByDeviceId(gladys, getConfig(), deviceExternalId);
    if (!route) throw new Error(`Unknown route: ${deviceExternalId}`);
    return route;
  }

  /**
   * The created routes picked in a "travel_times" widget (a multi_select of
   * route devices: every route when empty), in the slot order.
   */
  function pickRoutes(config, deviceExternalIds) {
    const picked = new Set(
      (Array.isArray(deviceExternalIds)
        ? deviceExternalIds
        : String(deviceExternalIds ?? '').split(',')
      )
        .map((id) => String(id).trim())
        .filter(Boolean),
    );
    return monitor
      .monitoredRoutes(config)
      .map((route) => ({ route, deviceExternalId: routeIds(gladys, route).device }))
      .filter(({ deviceExternalId }) => picked.size === 0 || picked.has(deviceExternalId));
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
            de: `Mapbox OK (Beispielstrecke in Paris: ${Math.round(sample.duration / 60)} min). Konfigurieren Sie jetzt Ihre Strecken.`,
            es: `Mapbox OK (trayecto de ejemplo en París: ${Math.round(sample.duration / 60)} min). Configure ahora sus trayectos.`,
          };
        }
        const { analysis, origin, waypoints, destination } = await monitor.computeRoute(
          route,
          config,
        );
        // Show every resolved place: the user checks the geocoding of the
        // waypoints too.
        const path = [origin, ...waypoints, destination].map((place) => place.label).join(' → ');
        return {
          en: `Mapbox OK — ${route.name} (${path}): ${formatSummary(analysis, 'en')}, usual ${Math.round(analysis.typicalMinutes)} min.`,
          fr: `Mapbox OK — ${route.name} (${path}) : ${formatSummary(analysis, 'fr')}, habituellement ${Math.round(analysis.typicalMinutes)} min.`,
          de: `Mapbox OK — ${route.name} (${path}): ${formatSummary(analysis, 'de')}, üblich ${Math.round(analysis.typicalMinutes)} min.`,
          es: `Mapbox OK — ${route.name} (${path}): ${formatSummary(analysis, 'es')}, habitualmente ${Math.round(analysis.typicalMinutes)} min.`,
        };
      },

      async refresh_now() {
        const config = getConfig();
        if (!config.access_token) return NO_TOKEN;
        if (monitor.monitoredRoutes(config).length === 0) {
          return {
            en: 'No route device created yet: add your routes from the Discovery tab.',
            fr: "Aucun appareil trajet créé : ajoutez vos trajets depuis l'onglet Découverte.",
            de: 'Noch kein Strecken-Gerät erstellt: Fügen Sie Ihre Strecken über den Reiter „Erkennung“ hinzu.',
            es: 'Aún no se ha creado ningún dispositivo de trayecto: añada sus trayectos desde la pestaña Descubrimiento.',
          };
        }
        const { refreshed, errors } = await monitor.refreshAll({ force: true });
        if (errors.length > 0) {
          throw new Error(`${errors.length} route(s) failed: ${errors[0].message}`);
        }
        return {
          en: `${refreshed} route(s) refreshed.`,
          fr: `${refreshed} trajet(s) actualisé(s).`,
          de: `${refreshed} Strecke(n) aktualisiert.`,
          es: `${refreshed} trayecto(s) actualizado(s).`,
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

    async listWidgetGet({ settings = {}, language }) {
      const config = getConfig();
      const entries = pickRoutes(config, settings.routes);
      // Routes never refreshed yet (outside the active window, just
      // restarted…): compute them now so the list is not empty.
      await Promise.all(
        entries.map(async (entry) => {
          entry.result = monitor.lastResult(entry.route.id);
          if (entry.result || !config.access_token) return;
          try {
            entry.result = await monitor.computeRoute(entry.route, config);
          } catch (err) {
            logger.warn(`Widget: live computation of "${entry.route.name}" failed: ${err.message}`);
          }
        }),
      );
      return buildTravelTimesContent({
        entries,
        active: isWithinActiveWindow(config, now()),
        language,
        timezone: config.timezone,
        now: now(),
        ttlSeconds: WIDGET_TTL_SECONDS,
      });
    },

    async quotaWidgetGet({ language }) {
      return buildQuotaContent({
        snapshot: usage.snapshot(),
        language,
        timezone: getConfig().timezone,
        ttlSeconds: WIDGET_TTL_SECONDS,
      });
    },

    async listWidgetAction(actionKey, params = {}, { settings = {} } = {}) {
      if (actionKey !== LIST_WIDGET_REFRESH_ACTION) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const config = getConfig();
      if (!config.access_token) return NO_TOKEN;
      const entries = pickRoutes(config, params.routes ?? settings.routes);
      const errors = [];
      for (const { route } of entries) {
        try {
          await monitor.refreshRoute(route);
        } catch (err) {
          logger.error(`Widget: refresh of "${route.name}" failed: ${err.message}`);
          errors.push(err);
        }
      }
      if (entries.length > 0 && errors.length === entries.length) throw errors[0];
      const refreshed = entries.length - errors.length;
      // A toast holds 200 characters at most.
      const failure = errors.length > 0 ? errors[0].message.slice(0, 100) : '';
      return {
        en: `${refreshed} route(s) refreshed${failure ? `, ${errors.length} failed: ${failure}` : '.'}`,
        fr: `${refreshed} trajet(s) actualisé(s)${failure ? `, ${errors.length} en échec : ${failure}` : '.'}`,
        de: `${refreshed} Strecke(n) aktualisiert${failure ? `, ${errors.length} fehlgeschlagen: ${failure}` : '.'}`,
        es: `${refreshed} trayecto(s) actualizado(s)${failure ? `, ${errors.length} con error: ${failure}` : '.'}`,
      };
    },

    async widgetAction(actionKey, _params, { settings = {} } = {}) {
      if (actionKey !== 'refresh') throw new Error(`Unknown widget action: ${actionKey}`);
      const config = getConfig();
      if (!config.access_token) return NO_TOKEN;
      const route = requireRoute(settings.route);
      const { analysis } = await monitor.refreshRoute(route);
      return Object.fromEntries(LANGUAGES.map((lang) => [lang, formatSummary(analysis, lang)]));
    },
  };
}
