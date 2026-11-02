import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsageCounter, FREE_TIER, monthOf } from '../src/usage.js';

const silent = { warn: () => {} };
const tempFile = () => join(mkdtempSync(join(tmpdir(), 'usage-')), 'data', 'usage.json');

test('monthOf is the UTC calendar month', () => {
  assert.equal(monthOf(new Date('2026-11-30T23:30:00Z')), '2026-11');
  assert.equal(monthOf(new Date('2026-12-01T00:00:00Z')), '2026-12');
});

test('the counter counts per API and survives a restart', () => {
  const path = tempFile();
  const now = () => new Date('2026-11-10T12:00:00Z');
  const usage = createUsageCounter({ path, now, logger: silent });
  usage.record('directions');
  usage.record('directions');
  usage.record('geocoding');
  usage.record('unknown');

  const restarted = createUsageCounter({ path, now, logger: silent });
  const { apis } = restarted.snapshot();
  assert.equal(apis.directions.used, 2);
  assert.equal(apis.geocoding.used, 1);
  assert.equal(apis.directions.free, FREE_TIER.directions);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).month, '2026-11');
});

test('a new month starts from zero, counted from its first day', () => {
  let date = new Date('2026-11-30T20:00:00Z');
  const usage = createUsageCounter({ path: null, now: () => date });
  usage.record('directions');
  date = new Date('2026-12-03T00:00:00Z');
  const snapshot = usage.snapshot();
  assert.equal(snapshot.month, '2026-12');
  assert.equal(snapshot.apis.directions.used, 0);
  assert.equal(snapshot.since.toISOString(), '2026-12-01T00:00:00.000Z');
});

test('the projection extrapolates the pace to the end of the month', () => {
  // Counting since Nov 1st; Nov 11th at 00:00 = 10 days out of 30.
  const path = tempFile();
  const usage = createUsageCounter({
    path,
    now: () => new Date('2026-11-01T00:00:00Z'),
    logger: silent,
  });
  for (let i = 0; i < 1000; i += 1) usage.record('directions');
  const later = createUsageCounter({
    path,
    now: () => new Date('2026-11-11T00:00:00Z'),
    logger: silent,
  });
  assert.equal(later.snapshot().apis.directions.projected, 3000);
});

test('no projection before a full day of counting', () => {
  const usage = createUsageCounter({ path: null, now: () => new Date('2026-11-10T12:00:00Z') });
  usage.record('directions');
  assert.equal(usage.snapshot().apis.directions.projected, null);
});

test('an unreadable or unwritable file does not break the counter', () => {
  const path = tempFile();
  const usage = createUsageCounter({ path, logger: silent });
  usage.record('directions');
  writeFileSync(path, '{ not json');
  assert.equal(createUsageCounter({ path, logger: silent }).snapshot().apis.directions.used, 0);

  // A file where the directory should be: the counter cannot be stored.
  const blocker = join(mkdtempSync(join(tmpdir(), 'usage-')), 'blocker');
  writeFileSync(blocker, '');
  const warnings = [];
  const readOnly = createUsageCounter({
    path: join(blocker, 'usage.json'),
    logger: { warn: (message) => warnings.push(message) },
  });
  readOnly.record('directions');
  assert.equal(readOnly.snapshot().apis.directions.used, 1);
  assert.equal(warnings.length, 1);
});
