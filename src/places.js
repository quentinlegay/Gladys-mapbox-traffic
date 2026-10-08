// -----------------------------------------------------------------------------
// Places: turn what the user typed (coordinates or an address) into a point.
// -----------------------------------------------------------------------------

import { geocode } from './mapbox.js';

const COORDINATES_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

/**
 * Parse "48.8566, 2.3522" (latitude, longitude — the order Google Maps and
 * OpenStreetMap copy them in). Returns null when the text is not a coordinate
 * pair, so it can be geocoded as an address instead.
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function parseCoordinates(text) {
  const match = String(text ?? '').match(COORDINATES_PATTERN);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/**
 * Resolves places, with an in-memory cache so an address is only geocoded
 * once (and again after a configuration change, which clears the cache).
 */
export function createPlaceResolver() {
  const cache = new Map();

  return {
    clear() {
      cache.clear();
    },

    /**
     * @param {string} text coordinates or an address
     * @param {{ accessToken: string, language?: string, home?: { latitude: number, longitude: number } }} options
     * @returns {Promise<{ latitude: number, longitude: number, label: string }>}
     */
    async resolve(text, { accessToken, language, home }) {
      const coordinates = parseCoordinates(text);
      if (coordinates) return { ...coordinates, label: text.trim() };

      const key = text.trim().toLowerCase();
      if (!cache.has(key)) {
        const pending = geocode({ accessToken, query: text.trim(), language, proximity: home });
        // Do not keep a failed lookup: the next refresh retries it.
        pending.catch(() => cache.delete(key));
        cache.set(key, pending);
      }
      return cache.get(key);
    },
  };
}
