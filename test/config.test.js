import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG, getConfiguredRoutes, MAX_ROUTES } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig coerces numeric strings and clamps them', () => {
  const config = normalizeConfig({ poll_frequency: '600', abnormal_ratio_percent: '-5' });
  assert.equal(config.poll_frequency, 600);
  assert.equal(config.abnormal_ratio_percent, 0);
  assert.equal(normalizeConfig({ poll_frequency: 5 }).poll_frequency, 60);
  assert.equal(normalizeConfig({ poll_frequency: '' }).poll_frequency, 300);
});

test('normalizeConfig keeps only known multi_select values', () => {
  const config = normalizeConfig({ active_days: ['mon', 'xxx', 'mon'], avoid: 'toll, ferry' });
  assert.deepEqual(config.active_days, ['mon']);
  assert.deepEqual(config.avoid, ['toll', 'ferry']);
});

test('normalizeConfig falls back to the default timezone when invalid', () => {
  assert.equal(normalizeConfig({ timezone: 'Mars/Olympus' }).timezone, 'Europe/Paris');
  assert.equal(normalizeConfig({ timezone: 'America/Montreal' }).timezone, 'America/Montreal');
});

test('normalizeConfig trims the token and the route fields', () => {
  const config = normalizeConfig({ access_token: ' pk.abc ', route_1_destination: ' Paris ' });
  assert.equal(config.access_token, 'pk.abc');
  assert.equal(config.route_1_destination, 'Paris');
});

test('getConfiguredRoutes keeps only the slots with a destination', () => {
  const routes = getConfiguredRoutes(
    normalizeConfig({
      route_1_name: 'Travail',
      route_1_destination: 'La Défense',
      route_2_name: 'Vide',
      route_3_destination: '48.85, 2.35',
    }),
  );
  assert.deepEqual(
    routes.map((r) => [r.id, r.name, r.origin, r.destination]),
    [
      ['route-1', 'Travail', '', 'La Défense'],
      ['route-3', 'Trajet 3', '', '48.85, 2.35'],
    ],
  );
  assert.ok(routes.length <= MAX_ROUTES);
});
