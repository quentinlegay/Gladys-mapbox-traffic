// -----------------------------------------------------------------------------
// Traffic analysis: pure functions, no I/O.
//
// From a Mapbox route, compute what the user cares about:
//   - the travel time now, the usual one, and the delay between both;
//   - the share of the distance driven in heavy / severe congestion;
//   - a traffic level (0 fluid → 3 severe), "traffic jam" (level >= 2) and
//     "abnormally long" (the delay crosses the configured thresholds).
// -----------------------------------------------------------------------------

export const TRAFFIC_LEVELS = ['fluid', 'moderate', 'heavy', 'severe'];

export const TRAFFIC_LEVEL_LABELS = {
  fluid: { en: 'Fluid', fr: 'Fluide' },
  moderate: { en: 'Moderate', fr: 'Ralenti' },
  heavy: { en: 'Traffic jam', fr: 'Embouteillage' },
  severe: { en: 'Severe jam', fr: 'Bouchon important' },
};

// Ratio duration / typical duration from which a level is reached, used on
// top of the congestion annotations (some roads carry no annotation).
const LEVEL_RATIOS = { moderate: 1.15, heavy: 1.35, severe: 1.7 };

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Distance driven in each congestion class, over all the legs of a route.
 * @returns {{ total: number, low: number, moderate: number, heavy: number, severe: number, unknown: number }}
 */
export function congestionDistances(route) {
  const totals = { total: 0, low: 0, moderate: 0, heavy: 0, severe: 0, unknown: 0 };
  for (const leg of route.legs ?? []) {
    const congestion = leg.annotation?.congestion ?? [];
    const distances = leg.annotation?.distance ?? [];
    congestion.forEach((level, i) => {
      const distance = Number(distances[i]) || 0;
      totals.total += distance;
      totals[level in totals ? level : 'unknown'] += distance;
    });
  }
  return totals;
}

/**
 * @param {object} route the Mapbox route (driving-traffic profile)
 * @param {object} options
 * @param {number} [options.fallbackTypicalSeconds] usual duration to use when
 *   Mapbox returns no `duration_typical` (free-flow duration)
 * @param {{ abnormal_ratio_percent: number, abnormal_min_delay_minutes: number, congestion_threshold_percent: number }} options.thresholds
 */
export function analyzeRoute(route, { fallbackTypicalSeconds, thresholds }) {
  const durationSeconds = Number(route.duration);
  const typicalSeconds = Number.isFinite(route.duration_typical)
    ? route.duration_typical
    : Number.isFinite(fallbackTypicalSeconds)
      ? fallbackTypicalSeconds
      : durationSeconds;
  const distanceMeters = Number(route.distance) || 0;

  const durationMinutes = round1(durationSeconds / 60);
  const typicalMinutes = round1(typicalSeconds / 60);
  const delayMinutes = round1(durationMinutes - typicalMinutes);
  const ratio = typicalSeconds > 0 ? durationSeconds / typicalSeconds : 1;

  const distances = congestionDistances(route);
  const share = (...classes) =>
    distances.total > 0
      ? (classes.reduce((sum, c) => sum + distances[c], 0) / distances.total) * 100
      : 0;
  const congestionPercent = Math.round(share('heavy', 'severe'));
  const threshold = thresholds.congestion_threshold_percent;

  let level = 0;
  if (share('severe') >= threshold || ratio >= LEVEL_RATIOS.severe) level = 3;
  else if (share('heavy', 'severe') >= threshold || ratio >= LEVEL_RATIOS.heavy) level = 2;
  else if (share('moderate', 'heavy', 'severe') >= threshold || ratio >= LEVEL_RATIOS.moderate)
    level = 1;

  const abnormal =
    delayMinutes >= thresholds.abnormal_min_delay_minutes &&
    ratio >= 1 + thresholds.abnormal_ratio_percent / 100;

  return {
    durationMinutes,
    typicalMinutes,
    delayMinutes,
    delayPercent: Math.round((ratio - 1) * 100),
    distanceKm: round1(distanceMeters / 1000),
    averageSpeedKmh:
      durationSeconds > 0 ? round1(distanceMeters / durationSeconds / (1000 / 3600)) : 0,
    congestionPercent,
    level,
    levelKey: TRAFFIC_LEVELS[level],
    trafficJam: level >= 2,
    abnormal,
    via: (route.legs ?? [])
      .map((leg) => leg.summary)
      .filter(Boolean)
      .join(' / '),
  };
}

/**
 * One-line human summary, e.g. "32 min (+7 min) · Ralenti".
 */
export function formatSummary(analysis, language = 'fr') {
  const lang = language === 'en' ? 'en' : 'fr';
  const delay = analysis.delayMinutes >= 1 ? ` (+${Math.round(analysis.delayMinutes)} min)` : '';
  return `${Math.round(analysis.durationMinutes)} min${delay} · ${
    TRAFFIC_LEVEL_LABELS[analysis.levelKey][lang]
  }`;
}
