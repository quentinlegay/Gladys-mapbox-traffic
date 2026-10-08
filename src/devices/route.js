// -----------------------------------------------------------------------------
// Device type: ROUTE
//
// One Gladys device per configured route (home → work…). Its read-only
// features are refreshed by the traffic monitor and kept in history, so the
// standard Gladys charts draw the travel time over the day / the week, and the
// standard scene triggers on device values work out of the box ("when the
// travel time to work is above 45 min…").
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { TRAFFIC_LEVEL_LABELS } from '../traffic.js';

export const ROUTE_DEVICE_TYPE = 'route';

// Feature keys: part of the feature external_ids, never rename them.
export const FEATURE = {
  DURATION: 'duration',
  TYPICAL_DURATION: 'typical-duration',
  DELAY: 'delay',
  DISTANCE: 'distance',
  TRAFFIC_LEVEL: 'traffic-level',
  TRAFFIC_STATUS: 'traffic-status',
  VIA: 'via',
};

const LABELS = {
  [FEATURE.DURATION]: { en: 'Travel time', fr: 'Durée du trajet' },
  [FEATURE.TYPICAL_DURATION]: { en: 'Usual travel time', fr: 'Durée habituelle' },
  [FEATURE.DELAY]: { en: 'Delay', fr: 'Retard' },
  [FEATURE.DISTANCE]: { en: 'Distance', fr: 'Distance' },
  [FEATURE.TRAFFIC_LEVEL]: { en: 'Traffic level (0-3)', fr: 'Niveau de trafic (0-3)' },
  [FEATURE.TRAFFIC_STATUS]: { en: 'Traffic', fr: 'Trafic' },
  [FEATURE.VIA]: { en: 'Via', fr: 'Par' },
};

export function routeIds(gladys, route) {
  return gladys.externalIds(ROUTE_DEVICE_TYPE, route.id);
}

/**
 * Feature external_id of a route device, from the DEVICE external_id (what a
 * `source: "devices"` select hands back).
 */
export function featureIdFromDevice(deviceExternalId, featureKey) {
  return `${deviceExternalId}:${featureKey}`;
}

function durationFeature(ids, key, language, { min, max }) {
  return {
    name: LABELS[key][language],
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
    unit: DEVICE_FEATURE_UNITS.MINUTES,
    min,
    max,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

function textFeature(ids, key, language) {
  return {
    name: LABELS[key][language],
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  };
}

/**
 * Discovery payload of one route device.
 */
export function buildRouteDevice(gladys, route, config) {
  const ids = routeIds(gladys, route);
  const language = config.language;
  return {
    name: route.name,
    external_id: ids.device,
    params: [
      { name: 'origin', value: route.origin || 'home' },
      { name: 'destination', value: route.destination },
    ],
    features: [
      durationFeature(ids, FEATURE.DURATION, language, { min: 0, max: 1440 }),
      durationFeature(ids, FEATURE.TYPICAL_DURATION, language, { min: 0, max: 1440 }),
      durationFeature(ids, FEATURE.DELAY, language, { min: -1440, max: 1440 }),
      {
        name: LABELS[FEATURE.DISTANCE][language],
        external_id: ids.feature(FEATURE.DISTANCE),
        category: DEVICE_FEATURE_CATEGORIES.DISTANCE_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.KM,
        min: 0,
        max: 5000,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: LABELS[FEATURE.TRAFFIC_LEVEL][language],
        external_id: ids.feature(FEATURE.TRAFFIC_LEVEL),
        category: DEVICE_FEATURE_CATEGORIES.RISK,
        type: DEVICE_FEATURE_TYPES.RISK.INTEGER,
        min: 0,
        max: 3,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      textFeature(ids, FEATURE.TRAFFIC_STATUS, language),
      textFeature(ids, FEATURE.VIA, language),
    ],
  };
}

/**
 * `publishStates` payload for one analysed route.
 */
export function buildRouteStates(gladys, route, analysis, config) {
  const ids = routeIds(gladys, route);
  const state = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  const states = [
    state(FEATURE.DURATION, analysis.durationMinutes),
    state(FEATURE.TYPICAL_DURATION, analysis.typicalMinutes),
    state(FEATURE.DELAY, analysis.delayMinutes),
    state(FEATURE.DISTANCE, analysis.distanceKm),
    state(FEATURE.TRAFFIC_LEVEL, analysis.level),
    state(FEATURE.TRAFFIC_STATUS, {
      text: TRAFFIC_LEVEL_LABELS[analysis.levelKey][config.language],
    }),
  ];
  if (analysis.via) states.push(state(FEATURE.VIA, { text: analysis.via }));
  return states;
}
