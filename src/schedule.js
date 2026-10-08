// -----------------------------------------------------------------------------
// Active window: on which days / at which hours the routes are refreshed.
//
// Polling a commute at 3 a.m. on a Sunday only burns the Mapbox quota, so the
// user can restrict the refreshes to some days and time ranges, read in the
// configured timezone (the container itself runs in UTC).
// -----------------------------------------------------------------------------

import { WEEK_DAYS } from './config.js';

const RANGE_PATTERN = /^(\d{1,2})[:h](\d{2})\s*-\s*(\d{1,2})[:h](\d{2})$/i;

/**
 * Parse "07:00-09:30, 16:30-19:00" into minute ranges. Overnight ranges
 * ("22:00-02:00") are allowed. Invalid chunks are reported, not thrown.
 * @returns {{ ranges: { start: number, end: number }[], invalid: string[] }}
 */
export function parseActiveHours(text) {
  const ranges = [];
  const invalid = [];
  for (const chunk of String(text ?? '')
    .split(/[,;]/)
    .map((c) => c.trim())
    .filter(Boolean)) {
    const match = chunk.match(RANGE_PATTERN);
    const [h1, m1, h2, m2] = match ? match.slice(1).map(Number) : [];
    if (!match || h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) {
      invalid.push(chunk);
      continue;
    }
    ranges.push({ start: h1 * 60 + m1, end: h2 * 60 + m2 });
  }
  return { ranges, invalid };
}

/**
 * Day of week ('mon'…'sun') and minutes since midnight of `date` in `timezone`.
 */
export function localTime(date, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: parts.weekday.toLowerCase().slice(0, 3),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * Whether the routes should be refreshed at `date`.
 */
export function isWithinActiveWindow(config, date = new Date()) {
  const { day, minutes } = localTime(date, config.timezone);
  const days = config.active_days.length > 0 ? config.active_days : WEEK_DAYS;
  const { ranges } = parseActiveHours(config.active_hours);

  if (ranges.length === 0) return days.includes(day);

  return ranges.some(({ start, end }) => {
    if (start <= end) return days.includes(day) && minutes >= start && minutes < end;
    // Overnight range: the part after midnight belongs to the previous day.
    const previousDay = WEEK_DAYS[(WEEK_DAYS.indexOf(day) + 6) % 7];
    return (
      (days.includes(day) && minutes >= start) || (days.includes(previousDay) && minutes < end)
    );
  });
}
