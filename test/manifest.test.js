// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, MAX_ROUTES, WEEK_DAYS, AVOID_OPTIONS } from '../src/config.js';
import { createHandlers } from '../src/handlers.js';
import { buildEventData, SCENE_EVENTS } from '../src/monitor.js';
import { analyzeRoute } from '../src/traffic.js';
import { WIDGET_INTERVALS, WIDGET_KEY } from '../src/widget.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { directionsRoute } from './helpers/mapboxFixtures.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const handlers = createHandlers({
  gladys: createFakeGladys(),
  monitor: {},
  getConfig: () => DEFAULT_CONFIG,
});
const optionValues = (key) =>
  manifest.config_schema.find((f) => f.key === key).options.map((o) => o.value);

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.keys(handlers.actions).sort());
});

test('every scene action has a handler', () => {
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.keys(handlers.sceneActions).sort(),
  );
});

test('the scene triggers are exactly the events the monitor fires', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_EVENTS).sort(),
  );
});

test('scene event data carries every declared filter and variable', () => {
  const analysis = analyzeRoute(directionsRoute({ duration: 1500, typical: 1500 }), {
    thresholds: DEFAULT_CONFIG,
  });
  const data = buildEventData(createFakeGladys(), { id: 'route-1', name: 'Work' }, analysis, 'en');
  assert.ok(Object.keys(data).length <= 30, 'at most 30 keys');
  for (const trigger of manifest.scene_triggers) {
    for (const field of [...(trigger.fields ?? []), ...(trigger.variables ?? [])]) {
      assert.ok(field.key in data, `${trigger.key}: "${field.key}" missing from the event data`);
    }
    const levelField = trigger.fields.find((f) => f.key === 'level');
    for (const option of levelField?.options ?? []) {
      assert.ok(['heavy', 'severe'].includes(option.value), 'a jam is heavy or severe');
    }
  }
});

test('the widget is registered with the declared key and intervals', () => {
  assert.deepEqual(
    manifest.widgets.map((w) => w.key),
    [WIDGET_KEY],
  );
  const interval = manifest.widgets[0].settings.find((s) => s.key === 'interval');
  assert.deepEqual(
    interval.options.map((o) => o.value),
    WIDGET_INTERVALS,
  );
});

test('scene and widget capabilities require Gladys >= 5.1.0', () => {
  const minVersion = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.\d+/);
  assert.ok(minVersion, 'gladys_version must declare a minimum version');
  const [, major, minor] = minVersion.map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 1));
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('every stored config key is known to DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema.filter((f) => f.type !== 'section')) {
    assert.ok(field.key in DEFAULT_CONFIG, `"${field.key}" is missing from DEFAULT_CONFIG`);
  }
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.ok(!(section.key in DEFAULT_CONFIG), `section "${section.key}" stores no value`);
  }
});

test('the manifest declares every route slot', () => {
  for (let slot = 1; slot <= MAX_ROUTES; slot += 1) {
    for (const field of ['name', 'origin', 'destination']) {
      assert.ok(manifest.config_schema.some((f) => f.key === `route_${slot}_${field}`));
    }
  }
});

test('multi_select options match the values the code accepts', () => {
  assert.deepEqual(optionValues('active_days'), WEEK_DAYS);
  assert.deepEqual(optionValues('avoid'), AVOID_OPTIONS);
});

test('the access token is a secret and the home location is requested', () => {
  assert.equal(manifest.config_schema.find((f) => f.key === 'access_token').type, 'secret');
  assert.equal(manifest.location, true);
});
