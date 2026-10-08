// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`.
// -----------------------------------------------------------------------------

// Number of route "slots" declared in the manifest (route_1_*, route_2_*…).
export const MAX_ROUTES = 3;

export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const AVOID_OPTIONS = ['toll', 'motorway', 'ferry'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  access_token: '',
  language: 'fr', // 'fr' | 'en', language of the text states (traffic status)
  poll_frequency: 300, // seconds between two refreshes of every route
  active_days: [], // empty = every day
  active_hours: '', // empty = all day long, e.g. "07:00-09:30, 16:30-19:00"
  timezone: 'Europe/Paris', // timezone used to read active_days / active_hours
  avoid: [], // road types to avoid: toll, motorway, ferry
  abnormal_ratio_percent: 30, // "abnormal" when duration >= typical * (1 + x%)
  abnormal_min_delay_minutes: 5, // ...and at least this many minutes late
  congestion_threshold_percent: 10, // share of the distance in heavy traffic
  ...Object.fromEntries(
    Array.from({ length: MAX_ROUTES }, (_, i) => [
      [`route_${i + 1}_name`, ''],
      [`route_${i + 1}_origin`, ''],
      [`route_${i + 1}_destination`, ''],
    ]).flat(),
  ),
};

function toNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function toString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

// A multi_select may arrive as an array, or as a comma-separated string.
function toList(value, allowed) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(list.map((v) => String(v).trim()).filter((v) => allowed.includes(v)))];
}

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...raw };
  const timezone = toString(raw.timezone, DEFAULT_CONFIG.timezone) || DEFAULT_CONFIG.timezone;
  const normalized = {
    ...config,
    access_token: toString(raw.access_token),
    language: raw.language === 'en' ? 'en' : 'fr',
    poll_frequency: toNumber(raw.poll_frequency, DEFAULT_CONFIG.poll_frequency, {
      min: 60,
      max: 3600,
    }),
    active_days: toList(raw.active_days, WEEK_DAYS),
    active_hours: toString(raw.active_hours),
    timezone: isValidTimezone(timezone) ? timezone : DEFAULT_CONFIG.timezone,
    avoid: toList(raw.avoid, AVOID_OPTIONS),
    abnormal_ratio_percent: toNumber(
      raw.abnormal_ratio_percent,
      DEFAULT_CONFIG.abnormal_ratio_percent,
      { min: 0, max: 500 },
    ),
    abnormal_min_delay_minutes: toNumber(
      raw.abnormal_min_delay_minutes,
      DEFAULT_CONFIG.abnormal_min_delay_minutes,
      { min: 0, max: 600 },
    ),
    congestion_threshold_percent: toNumber(
      raw.congestion_threshold_percent,
      DEFAULT_CONFIG.congestion_threshold_percent,
      { min: 1, max: 100 },
    ),
  };
  for (let i = 1; i <= MAX_ROUTES; i += 1) {
    for (const field of ['name', 'origin', 'destination']) {
      const key = `route_${i}_${field}`;
      normalized[key] = toString(raw[key]);
    }
  }
  return normalized;
}

/**
 * The routes the user actually configured (a slot counts once it has a
 * destination). The origin may be empty: the home location is used then.
 * @returns {{ slot: number, id: string, name: string, origin: string, destination: string }[]}
 */
export function getConfiguredRoutes(config) {
  const routes = [];
  for (let slot = 1; slot <= MAX_ROUTES; slot += 1) {
    const destination = config[`route_${slot}_destination`];
    if (!destination) continue;
    routes.push({
      slot,
      // Stable platform id: the slot number. Editing the addresses of a slot
      // keeps the same Gladys device (and its history).
      id: `route-${slot}`,
      name:
        config[`route_${slot}_name`] ||
        (config.language === 'en' ? `Route ${slot}` : `Trajet ${slot}`),
      origin: config[`route_${slot}_origin`],
      destination,
    });
  }
  return routes;
}
