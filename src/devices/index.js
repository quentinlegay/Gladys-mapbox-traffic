// -----------------------------------------------------------------------------
// Device registry.
//
// Unlike a fixed hardware catalog, the devices of this integration come from
// the configuration: one "route" device per route slot the user filled in.
// -----------------------------------------------------------------------------

import { getConfiguredRoutes } from '../config.js';
import { buildRouteDevice, routeIds } from './route.js';

/**
 * Build the discovery payload for Gladys (one device per configured route).
 */
export function buildDiscoveredDevices(gladys, config) {
  return getConfiguredRoutes(config).map((route) => buildRouteDevice(gladys, route, config));
}

/**
 * Find the configured route behind a device external_id (from onPoll, a
 * `source: "devices"` select, a widget setting…).
 */
export function findRouteByDeviceId(gladys, config, deviceExternalId) {
  return getConfiguredRoutes(config).find(
    (route) => routeIds(gladys, route).device === deviceExternalId,
  );
}
