// -----------------------------------------------------------------------------
// Mapbox "driver": the only file that talks to the Mapbox APIs.
//
//   - Directions API v5 (https://docs.mapbox.com/api/navigation/directions/):
//     the `driving-traffic` profile gives the travel time with LIVE traffic, the
//     `duration_typical` (usual travel time at this time of the week) and, with
//     `annotations=congestion`, the congestion level of every road segment;
//   - Geocoding API v6: turns an address typed by the user into coordinates.
//
// Node 20+ provides `fetch` natively: no dependency needed.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'mapbox' });

const API_BASE_URL = 'https://api.mapbox.com';
const REQUEST_TIMEOUT_MS = 10_000;

export class MapboxError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string }} [details]
   */
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'MapboxError';
    this.status = status;
    this.code = code;
  }

  /** The access token is missing, invalid or lacks the required scope. */
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
}

// Never write the access token in the logs.
function redact(url) {
  return url.replace(/access_token=[^&]+/, 'access_token=***');
}

async function request(url) {
  logger.debug('Mapbox request ->', redact(url));
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new MapboxError(`Mapbox unreachable: ${err.message}`);
  }
  let body = {};
  try {
    body = await response.json();
  } catch {
    // Some error responses have no JSON body: keep the HTTP status only.
  }
  if (!response.ok) {
    const reason = body.message ?? body.code ?? '';
    throw new MapboxError(`Mapbox HTTP ${response.status}${reason ? `: ${reason}` : ''}`, {
      status: response.status,
      code: body.code,
    });
  }
  return body;
}

/**
 * Format a coordinate pair the way Mapbox expects it: "longitude,latitude".
 * @param {{ latitude: number, longitude: number }} point
 */
function formatPoint({ latitude, longitude }) {
  return `${Number(longitude).toFixed(6)},${Number(latitude).toFixed(6)}`;
}

/**
 * Compute a route with the Directions API.
 * @param {object} options
 * @param {string} options.accessToken Mapbox public access token
 * @param {{ latitude: number, longitude: number }} options.origin
 * @param {{ latitude: number, longitude: number }} options.destination
 * @param {'driving-traffic' | 'driving'} [options.profile]
 * @param {string[]} [options.exclude] road types to avoid (toll, motorway, ferry)
 * @param {boolean} [options.congestion] request the per-segment congestion
 * @returns {Promise<object>} the first (recommended) route of the response
 */
export async function fetchRoute({
  accessToken,
  origin,
  destination,
  profile = 'driving-traffic',
  exclude = [],
  congestion = true,
}) {
  const params = new URLSearchParams({ access_token: accessToken, alternatives: 'false' });
  if (congestion) {
    // Annotations are only returned with the full geometry.
    params.set('overview', 'full');
    params.set('geometries', 'polyline6');
    params.set('annotations', 'congestion,distance');
  } else {
    params.set('overview', 'false');
  }
  if (exclude.length > 0) params.set('exclude', exclude.join(','));

  const coordinates = `${formatPoint(origin)};${formatPoint(destination)}`;
  // Coordinates are formatted numbers only: nothing to escape in the path.
  const url = `${API_BASE_URL}/directions/v5/mapbox/${profile}/${coordinates}?${params}`;

  const body = await request(url);
  if (body.code !== 'Ok' || !Array.isArray(body.routes) || body.routes.length === 0) {
    // e.g. NoRoute (no road between the points), NoSegment (a point too far
    // from any road), InvalidInput.
    throw new MapboxError(`Mapbox found no route (${body.code ?? 'no routes'})`, {
      code: body.code,
    });
  }
  return body.routes[0];
}

/**
 * Turn a free-text address into coordinates with the Geocoding API v6.
 * @param {object} options
 * @param {string} options.accessToken
 * @param {string} options.query the address typed by the user
 * @param {string} [options.language]
 * @param {{ latitude: number, longitude: number }} [options.proximity] bias the
 *   results around this point (the home)
 * @returns {Promise<{ latitude: number, longitude: number, label: string }>}
 */
export async function geocode({ accessToken, query, language, proximity }) {
  const params = new URLSearchParams({ access_token: accessToken, q: query, limit: '1' });
  if (language) params.set('language', language);
  if (proximity) params.set('proximity', formatPoint(proximity));

  const body = await request(`${API_BASE_URL}/search/geocode/v6/forward?${params}`);
  const feature = body.features?.[0];
  const [longitude, latitude] = feature?.geometry?.coordinates ?? [];
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new MapboxError(`Address not found: "${query}"`, { code: 'NotFound' });
  }
  return {
    latitude,
    longitude,
    label: feature.properties?.full_address ?? feature.properties?.name ?? query,
  };
}
