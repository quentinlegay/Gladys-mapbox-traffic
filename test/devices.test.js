import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { buildDiscoveredDevices, findRouteByDeviceId } from '../src/devices/index.js';
import { FEATURE } from '../src/devices/route.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const gladys = createFakeGladys();
const config = normalizeConfig({
  route_1_name: 'Travail',
  route_1_destination: 'La Défense',
  route_2_destination: '48.85, 2.35',
});

test('one device per configured route, with unique external ids', () => {
  const devices = buildDiscoveredDevices(gladys, config);
  assert.equal(devices.length, 2);
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      ['Travail', 'ext:mapbox-traffic:route:route-1'],
      ['Trajet 2', 'ext:mapbox-traffic:route:route-2'],
    ],
  );
  const featureIds = devices.flatMap((d) => d.features.map((f) => f.external_id));
  assert.equal(new Set(featureIds).size, featureIds.length);
});

test('no route configured means no device', () => {
  assert.deepEqual(buildDiscoveredDevices(gladys, normalizeConfig()), []);
});

test('the travel time is a duration in minutes kept in history', () => {
  const [device] = buildDiscoveredDevices(gladys, config);
  const duration = device.features.find((f) => f.external_id.endsWith(`:${FEATURE.DURATION}`));
  assert.equal(duration.category, DEVICE_FEATURE_CATEGORIES.DURATION);
  assert.equal(duration.type, DEVICE_FEATURE_TYPES.DURATION.DECIMAL);
  assert.equal(duration.unit, DEVICE_FEATURE_UNITS.MINUTES);
  assert.equal(duration.keep_history, true);
  for (const feature of device.features) {
    assert.equal(feature.read_only, true, `${feature.external_id} is a sensor`);
  }
});

test('feature names follow the configured language', () => {
  const [fr] = buildDiscoveredDevices(gladys, config);
  const [en] = buildDiscoveredDevices(gladys, { ...config, language: 'en' });
  assert.equal(fr.features[0].name, 'Durée du trajet');
  assert.equal(en.features[0].name, 'Travel time');
});

test('findRouteByDeviceId routes a device external_id back to its route', () => {
  assert.equal(findRouteByDeviceId(gladys, config, 'ext:mapbox-traffic:route:route-2').slot, 2);
  assert.equal(findRouteByDeviceId(gladys, config, 'unknown'), undefined);
});
