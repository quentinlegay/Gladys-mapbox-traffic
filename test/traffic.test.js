import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRoute, congestionDistances, formatSummary } from '../src/traffic.js';
import { normalizeConfig } from '../src/config.js';
import { directionsRoute } from './helpers/mapboxFixtures.js';

const thresholds = normalizeConfig();

test('a fluid route at its usual duration is level 0, not abnormal', () => {
  const analysis = analyzeRoute(directionsRoute({ duration: 1500, typical: 1500 }), {
    thresholds,
  });
  assert.equal(analysis.durationMinutes, 25);
  assert.equal(analysis.typicalMinutes, 25);
  assert.equal(analysis.delayMinutes, 0);
  assert.equal(analysis.distanceKm, 20);
  assert.equal(analysis.averageSpeedKmh, 48);
  assert.equal(analysis.level, 0);
  assert.equal(analysis.levelKey, 'fluid');
  assert.equal(analysis.trafficJam, false);
  assert.equal(analysis.abnormal, false);
  assert.equal(analysis.via, 'A86, A1');
});

test('heavy congestion on enough of the distance is a traffic jam', () => {
  const congestion = [...Array(17).fill('low'), 'heavy', 'heavy', 'severe'];
  const analysis = analyzeRoute(directionsRoute({ duration: 1600, typical: 1500, congestion }), {
    thresholds,
  });
  assert.equal(analysis.congestionPercent, 15);
  assert.equal(analysis.level, 2);
  assert.equal(analysis.trafficJam, true);
  // +1.7 min only: a jam, but not an abnormally long trip.
  assert.equal(analysis.abnormal, false);
});

test('severe congestion share gives level 3', () => {
  const congestion = [...Array(18).fill('low'), 'severe', 'severe'];
  const analysis = analyzeRoute(directionsRoute({ duration: 1500, typical: 1500, congestion }), {
    thresholds,
  });
  assert.equal(analysis.levelKey, 'severe');
});

test('the duration ratio raises the level even without annotations', () => {
  const route = directionsRoute({ duration: 2100, typical: 1500, congestion: [] });
  route.distance = 20000;
  const analysis = analyzeRoute(route, { thresholds });
  assert.equal(analysis.level, 2); // ratio 1.4
  assert.equal(analysis.congestionPercent, 0);
});

test('abnormal needs both the ratio and the minimum delay', () => {
  const longTrip = analyzeRoute(directionsRoute({ duration: 2400, typical: 1500 }), {
    thresholds,
  });
  assert.equal(longTrip.delayMinutes, 15);
  assert.equal(longTrip.delayPercent, 60);
  assert.equal(longTrip.abnormal, true);

  // +50 % but only +2 min on a short trip: not abnormal.
  const shortTrip = analyzeRoute(directionsRoute({ duration: 360, typical: 240 }), {
    thresholds,
  });
  assert.equal(shortTrip.abnormal, false);
});

test('the free-flow fallback is used when Mapbox has no typical duration', () => {
  const analysis = analyzeRoute(directionsRoute({ duration: 1800 }), {
    fallbackTypicalSeconds: 1200,
    thresholds,
  });
  assert.equal(analysis.typicalMinutes, 20);
  assert.equal(analysis.delayMinutes, 10);
});

test('congestionDistances sums every leg and buckets unknown classes', () => {
  const route = {
    legs: [
      { annotation: { congestion: ['low', 'heavy'], distance: [100, 50] } },
      { annotation: { congestion: ['weird'], distance: [25] } },
      {},
    ],
  };
  assert.deepEqual(congestionDistances(route), {
    total: 175,
    low: 100,
    moderate: 0,
    heavy: 50,
    severe: 0,
    unknown: 25,
  });
});

test('formatSummary is localized', () => {
  const analysis = analyzeRoute(directionsRoute({ duration: 2400, typical: 1500 }), {
    thresholds,
  });
  assert.equal(formatSummary(analysis, 'fr'), '40 min (+15 min) · Embouteillage');
  assert.equal(formatSummary(analysis, 'en'), '40 min (+15 min) · Traffic jam');
});
