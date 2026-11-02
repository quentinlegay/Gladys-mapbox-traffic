// -----------------------------------------------------------------------------
// Monthly counter of the Mapbox requests, against the free tier.
//
// Mapbox counts the requests of each API per calendar month and offers a free
// monthly tier (100,000 Directions requests and 100,000 Temporary Geocoding
// requests). A public token cannot read the account usage, so the integration
// counts its own successful requests. The count lives in /data/usage.json so
// that a restart does not reset it.
//
// It is an estimate: the month is the UTC calendar month, and the Mapbox
// account (Statistics page) is the reference — other apps using the same
// account count there too.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const USAGE_APIS = { DIRECTIONS: 'directions', GEOCODING: 'geocoding' };

// Free requests a month, per API (Mapbox pricing, pay-as-you-go plan).
export const FREE_TIER = {
  [USAGE_APIS.DIRECTIONS]: 100_000,
  [USAGE_APIS.GEOCODING]: 100_000,
};

const APIS = Object.values(USAGE_APIS);
const DAY_MS = 24 * 60 * 60 * 1000;
const zero = () => Object.fromEntries(APIS.map((api) => [api, 0]));

/** "YYYY-MM" of the UTC calendar month of a date. */
export function monthOf(date) {
  return new Date(date).toISOString().slice(0, 7);
}

function monthBounds(month) {
  const [year, index] = month.split('-').map(Number);
  return { start: Date.UTC(year, index - 1, 1), end: Date.UTC(year, index, 1) };
}

/**
 * @param {object} options
 * @param {string | null} options.path the JSON file (null: memory only)
 * @param {() => Date} [options.now]
 * @param {{ warn: (message: string) => void }} [options.logger]
 */
export function createUsageCounter({ path, now = () => new Date(), logger = console }) {
  // `since`: when counting started this month (the first start of the
  // integration may be in the middle of a month).
  const fresh = () => ({ month: monthOf(now()), since: now().toISOString(), calls: zero() });
  let state = fresh();

  if (path) {
    try {
      const stored = JSON.parse(readFileSync(path, 'utf8'));
      if (typeof stored?.month === 'string' && stored.calls && typeof stored.calls === 'object') {
        const calls = zero();
        for (const api of APIS) {
          if (Number.isInteger(stored.calls[api]) && stored.calls[api] > 0) {
            calls[api] = stored.calls[api];
          }
        }
        const since = Number.isNaN(Date.parse(stored.since)) ? state.since : stored.since;
        state = { month: stored.month, since, calls };
      }
    } catch {
      // No file yet (first start) or unreadable: start from zero.
    }
  }

  function rollOver() {
    if (monthOf(now()) !== state.month) {
      // A new month starts at its first instant, not when it is noticed.
      const month = monthOf(now());
      state = { month, since: new Date(monthBounds(month).start).toISOString(), calls: zero() };
    }
  }

  function save() {
    if (!path) return;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
    } catch (err) {
      logger.warn(`Unable to store the Mapbox usage counter: ${err.message}`);
    }
  }

  return {
    /** Count one successful (billable) request of an API. */
    record(api) {
      if (!APIS.includes(api)) return;
      rollOver();
      state.calls[api] += 1;
      save();
    },

    /**
     * Requests of the month per API, and the projection at the end of the
     * month at the current pace (null before a full day of counting: too
     * early to extrapolate).
     * @returns {{ month: string, since: Date, apis: Record<string, { used: number, free: number, projected: number | null }> }}
     */
    snapshot() {
      rollOver();
      const { start, end } = monthBounds(state.month);
      const counted = Math.max(start, Date.parse(state.since));
      const elapsed = now().getTime() - counted;
      const remaining = end - now().getTime();
      const apis = {};
      for (const api of APIS) {
        const used = state.calls[api];
        apis[api] = {
          used,
          free: FREE_TIER[api],
          projected: elapsed >= DAY_MS ? Math.round(used + (used / elapsed) * remaining) : null,
        };
      }
      return { month: state.month, since: new Date(counted), apis };
    },
  };
}
