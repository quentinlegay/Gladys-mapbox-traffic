// -----------------------------------------------------------------------------
// Dashboard widget "travel_time": the travel time of one route, its delay, the
// traffic status and the chart of the travel time vs the usual one.
//
// The content is declarative (the core renders it with its own theme): the
// tiles and the chart are bound to the device features, so they follow the
// published states live, without any refresh nudge.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE, featureIdFromDevice } from './devices/route.js';
import { TRAFFIC_LEVEL_LABELS } from './traffic.js';

export const WIDGET_KEY = 'travel_time';
export const WIDGET_REFRESH_ACTION = 'refresh';

export const WIDGET_INTERVALS = ['last-twelve-hours', 'last-day', 'last-three-days', 'last-week'];

const LEVEL_COLORS = [
  WIDGET_COLORS.SUCCESS,
  WIDGET_COLORS.WARNING,
  WIDGET_COLORS.DANGER,
  WIDGET_COLORS.DANGER,
];

const T = {
  duration: { en: 'Travel time', fr: 'Durée' },
  delay: { en: 'Delay', fr: 'Retard' },
  usual: { en: 'Usual', fr: 'Habituel' },
  traffic: { en: 'Traffic', fr: 'Trafic' },
  congestion: { en: 'Congested', fr: 'Encombré' },
  distance: { en: 'Distance', fr: 'Distance' },
  via: { en: 'Via', fr: 'Par' },
  updated: { en: 'Updated', fr: 'Mis à jour' },
  chart: { en: 'Travel time (min)', fr: 'Durée du trajet (min)' },
  refresh: { en: 'Refresh', fr: 'Actualiser' },
  noRoute: {
    en: 'This route is no longer configured.',
    fr: "Ce trajet n'est plus configuré.",
  },
  pickRoute: {
    en: 'Pick a route in the widget settings.',
    fr: 'Choisissez un trajet dans les réglages du widget.',
  },
};

function formatTime(date, language, timezone) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * @param {object} options
 * @param {string} options.deviceExternalId the route device chosen in the settings
 * @param {object | undefined} options.route the configured route, if still configured
 * @param {object | undefined} options.result last refresh result of the route
 * @param {string} options.interval chart interval
 * @param {string} options.language
 * @param {string} options.timezone
 * @param {number} options.ttlSeconds
 */
export function buildWidgetContent({
  deviceExternalId,
  route,
  result,
  interval,
  language,
  timezone,
  ttlSeconds,
}) {
  const lang = language === 'fr' ? 'fr' : 'en';
  if (!deviceExternalId || !route) {
    return {
      components: [
        { type: 'text', variant: 'body', text: deviceExternalId ? T.noRoute : T.pickRoute },
      ],
    };
  }
  const feature = (key) => featureIdFromDevice(deviceExternalId, key);
  const analysis = result?.analysis;
  const color = analysis ? LEVEL_COLORS[analysis.level] : WIDGET_COLORS.NEUTRAL;

  const components = [
    { type: 'text', variant: 'heading', text: route.name },
    {
      type: 'value',
      device_feature: feature(FEATURE.DURATION),
      label: T.duration,
      icon: 'clock',
      color,
    },
    {
      type: 'value',
      device_feature: feature(FEATURE.DELAY),
      label: T.delay,
      icon: 'alert-triangle',
      color,
    },
    {
      type: 'chart',
      device_features: [feature(FEATURE.DURATION), feature(FEATURE.TYPICAL_DURATION)],
      interval: WIDGET_INTERVALS.includes(interval) ? interval : 'last-day',
      chart_type: 'line',
      title: T.chart,
      unit: 'min',
    },
  ];

  if (analysis) {
    const items = [
      { label: T.traffic, value: TRAFFIC_LEVEL_LABELS[analysis.levelKey], color },
      { label: T.usual, value: `${Math.round(analysis.typicalMinutes)} min` },
      { label: T.congestion, value: `${analysis.congestionPercent} %` },
      { label: T.distance, value: `${analysis.distanceKm} km` },
    ];
    if (analysis.via) items.push({ label: T.via, value: analysis.via });
    items.push({ label: T.updated, value: formatTime(result.updatedAt, lang, timezone) });
    // Resolve the multi-language values: a status value is a plain string.
    components.push({
      type: 'status',
      items: items.map((item) => ({
        ...item,
        value: typeof item.value === 'object' ? item.value[lang] : item.value,
      })),
    });
  }

  components.push({
    type: 'button',
    label: T.refresh,
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_REFRESH_ACTION },
  });

  return { ttl_seconds: ttlSeconds, components };
}
