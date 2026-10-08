// -----------------------------------------------------------------------------
// Mapbox API responses used by the tests, and a fake `fetch` routing them.
// -----------------------------------------------------------------------------

/**
 * A Directions API route (driving-traffic profile), 20 km.
 * @param {object} options
 * @param {number} options.duration seconds with live traffic
 * @param {number | undefined} options.typical `duration_typical`, seconds
 * @param {string[]} options.congestion one class per 1 km segment
 */
export function directionsRoute({ duration, typical, congestion = Array(20).fill('low') }) {
  const route = {
    duration,
    distance: congestion.length * 1000,
    legs: [
      {
        summary: 'A86, A1',
        annotation: { congestion, distance: congestion.map(() => 1000) },
      },
    ],
  };
  if (typical !== undefined) route.duration_typical = typical;
  return route;
}

export function directionsResponse(route) {
  return { code: 'Ok', routes: [route] };
}

export function geocodingResponse(longitude, latitude, address) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        properties: { full_address: address },
      },
    ],
  };
}

/**
 * Replace globalThis.fetch with a router: `handler(url)` returns the JSON
 * body, or `{ status, body }` for an error. Every requested URL is recorded.
 */
export function mockFetch(handler) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const result = await handler(new URL(url));
    const status = result?.status ?? 200;
    const body = result?.status ? result.body : result;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, restore: () => (globalThis.fetch = realFetch) };
}
