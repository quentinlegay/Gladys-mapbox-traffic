import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseActiveHours, isWithinActiveWindow, localTime } from '../src/schedule.js';
import { normalizeConfig } from '../src/config.js';

// 2026-10-07 is a Wednesday. Paris is UTC+2 in October (summer time).
const at = (iso) => new Date(iso);

test('parseActiveHours reads ranges and reports invalid chunks', () => {
  const { ranges, invalid } = parseActiveHours('07:00-09:30, 16h30-19h00; 25:00-26:00, nope');
  assert.deepEqual(ranges, [
    { start: 420, end: 570 },
    { start: 990, end: 1140 },
  ]);
  assert.deepEqual(invalid, ['25:00-26:00', 'nope']);
});

test('localTime reads the day and time in the configured timezone', () => {
  assert.deepEqual(localTime(at('2026-10-07T22:30:00Z'), 'Europe/Paris'), {
    day: 'thu',
    minutes: 30,
  });
});

test('an empty window means always active', () => {
  assert.equal(isWithinActiveWindow(normalizeConfig(), at('2026-10-07T01:00:00Z')), true);
});

test('active hours are read in the configured timezone', () => {
  const config = normalizeConfig({ active_hours: '07:00-09:30' });
  assert.equal(isWithinActiveWindow(config, at('2026-10-07T05:30:00Z')), true); // 07:30 Paris
  assert.equal(isWithinActiveWindow(config, at('2026-10-07T07:30:00Z')), false); // 09:30 Paris
});

test('active days restrict the refreshes', () => {
  const config = normalizeConfig({ active_days: ['mon', 'tue', 'wed', 'thu', 'fri'] });
  assert.equal(isWithinActiveWindow(config, at('2026-10-07T10:00:00Z')), true); // Wednesday
  assert.equal(isWithinActiveWindow(config, at('2026-10-10T10:00:00Z')), false); // Saturday
});

test('an overnight range belongs to the day it started', () => {
  const config = normalizeConfig({ active_days: ['fri'], active_hours: '22:00-02:00' });
  assert.equal(isWithinActiveWindow(config, at('2026-10-09T21:00:00Z')), true); // Fri 23:00
  assert.equal(isWithinActiveWindow(config, at('2026-10-09T23:30:00Z')), true); // Sat 01:30
  assert.equal(isWithinActiveWindow(config, at('2026-10-10T21:00:00Z')), false); // Sat 23:00
});
