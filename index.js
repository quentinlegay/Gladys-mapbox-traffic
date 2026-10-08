// -----------------------------------------------------------------------------
// Entry point of the Gladys Mapbox Traffic integration.
//
// Role of this file: wire the SDK to the traffic monitor and the handlers. It
// holds NO business logic:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, publishes the route devices and starts the refresh loop.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { buildDiscoveredDevices, findRouteByDeviceId } from './src/devices/index.js';
import { createHandlers } from './src/handlers.js';
import { MapboxError } from './src/mapbox.js';
import { createTrafficMonitor } from './src/monitor.js';
import { WIDGET_KEY } from './src/widget.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();
const getConfig = () => config;

const monitor = createTrafficMonitor({
  gladys,
  getConfig,
  onRefreshResult: (error) => reportConnectionStatus(error),
});
const handlers = createHandlers({ gladys, monitor, getConfig });

// --- Application-level status, shown in the Configuration screen -------------
async function reportConnectionStatus(error = null) {
  let message;
  if (!config.access_token) {
    message = {
      en: 'Fill in your Mapbox access token.',
      fr: "Renseignez votre jeton d'accès Mapbox.",
    };
  } else if (error instanceof MapboxError && error.isAuthError) {
    message = {
      en: 'Mapbox refused the access token: check it in your Mapbox account.',
      fr: "Mapbox a refusé le jeton d'accès : vérifiez-le dans votre compte Mapbox.",
    };
  } else if (error instanceof MapboxError && error.status === undefined && !error.code) {
    message = { en: 'Mapbox is unreachable.', fr: 'Mapbox est injoignable.' };
  }
  // Route-level errors (an address not found…) do not mean the service is
  // disconnected: they are logged and shown by the "Test" action.
  await gladys.setConnectionStatus(!message, message).catch(() => {});
}

// The home location, used as the origin of the routes that leave it empty.
async function loadHome() {
  try {
    const houses = await gladys.getHouses();
    const located = houses.find((h) => h.latitude !== null && h.longitude !== null);
    monitor.setHome(located ?? null);
    if (!located) logger.warn('No house with a location in Gladys: route origins are required');
  } catch (err) {
    monitor.setHome(null);
    logger.warn(`Cannot read the home location: ${err.message}`);
  }
}

async function publishDevices() {
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the route devices');
  await publishDevices();
});

// --- Polling: Gladys asks to refresh a device --------------------------------
// The integration runs its own refresh loop (see monitor.start); a poll
// request from Gladys simply refreshes that route now.
gladys.onPoll(async (device) => {
  const route = findRouteByDeviceId(gladys, config, device.external_id);
  if (route) await monitor.refreshRoute(route);
});

// A route device was just added from the Discovery tab: fill it right away
// instead of waiting for the next refresh round.
gladys.onDeviceCreated(async (device) => {
  const route = findRouteByDeviceId(gladys, config, device.external_id);
  if (!route || !config.access_token) return;
  await monitor.refreshRoute(route).catch((err) => {
    logger.error(`First refresh of "${route.name}" failed: ${err.message}`);
  });
});

// --- Manifest actions: buttons in the Configuration screen -------------------
for (const [key, handler] of Object.entries(handlers.actions)) {
  gladys.onAction(key, (fields) => handler(fields));
}

// --- Scene actions -------------------------------------------------------------
for (const [key, handler] of Object.entries(handlers.sceneActions)) {
  gladys.onSceneAction(key, (fields) => handler(fields));
}

// --- Dashboard widget ----------------------------------------------------------
gladys.onWidgetGet(WIDGET_KEY, (options) => handlers.widgetGet(options));
gladys.onWidgetAction(WIDGET_KEY, (actionKey, params, options) =>
  handlers.widgetAction(actionKey, params, options),
);

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  monitor.reset();
  // publishDiscoveredDevices is idempotent (upsert by external_id).
  await publishDevices();
  await reportConnectionStatus();
  // Restart the loop: the frequency may have changed, and refresh now.
  monitor.start();
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await loadHome();
    await publishDevices();
    await reportConnectionStatus();
    monitor.start();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  monitor.stop();
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  monitor.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Mapbox Traffic integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
