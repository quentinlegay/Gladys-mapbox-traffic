// -----------------------------------------------------------------------------
// Dashboard widgets:
//   - "travel_time": the travel time of one route, its delay, the traffic
//     status and the chart of the travel time vs the usual one;
//   - "travel_times": every route as a list (travel time, distance, main
//     roads and a delay badge), each row opening the details of the route,
//     and a "Refresh all" button;
//   - "mapbox_quota": the Mapbox requests of the month against the free
//     tier, and the projection at the end of the month.
//
// The content is declarative (the core renders it with its own theme): the
// tiles and the chart are bound to the device features, so they follow the
// published states live, without any refresh nudge.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { toLanguage } from './config.js';
import { FEATURE, featureIdFromDevice } from './devices/route.js';
import { TRAFFIC_LEVEL_LABELS } from './traffic.js';
import { USAGE_APIS } from './usage.js';

export const WIDGET_KEY = 'travel_time';
export const WIDGET_REFRESH_ACTION = 'refresh';

export const LIST_WIDGET_KEY = 'travel_times';
export const LIST_WIDGET_REFRESH_ACTION = 'refresh_all';
// Rows of a `card-list` in list display (the core keeps 8 at most).
const MAX_LIST_ITEMS = 8;

export const QUOTA_WIDGET_KEY = 'mapbox_quota';

export const WIDGET_INTERVALS = ['last-twelve-hours', 'last-day', 'last-three-days', 'last-week'];

const LEVEL_COLORS = [
  WIDGET_COLORS.SUCCESS,
  WIDGET_COLORS.WARNING,
  WIDGET_COLORS.DANGER,
  WIDGET_COLORS.DANGER,
];

const T = {
  duration: { en: 'Travel time', fr: 'Durée', de: 'Fahrzeit', es: 'Duración' },
  delay: { en: 'Delay', fr: 'Retard', de: 'Verspätung', es: 'Retraso' },
  usual: { en: 'Usual', fr: 'Habituel', de: 'Üblich', es: 'Habitual' },
  traffic: { en: 'Traffic', fr: 'Trafic', de: 'Verkehr', es: 'Tráfico' },
  congestion: { en: 'Congested', fr: 'Encombré', de: 'Gestaut', es: 'Congestionado' },
  distance: { en: 'Distance', fr: 'Distance', de: 'Entfernung', es: 'Distancia' },
  via: { en: 'Via', fr: 'Par', de: 'Über', es: 'Por' },
  updated: { en: 'Updated', fr: 'Mis à jour', de: 'Aktualisiert', es: 'Actualizado' },
  chart: {
    en: 'Travel time (min)',
    fr: 'Durée du trajet (min)',
    de: 'Fahrzeit (min)',
    es: 'Duración del trayecto (min)',
  },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  noRoute: {
    en: 'This route is no longer configured.',
    fr: "Ce trajet n'est plus configuré.",
    de: 'Diese Strecke ist nicht mehr konfiguriert.',
    es: 'Este trayecto ya no está configurado.',
  },
  pickRoute: {
    en: 'Pick a route in the widget settings.',
    fr: 'Choisissez un trajet dans les réglages du widget.',
    de: 'Wählen Sie eine Strecke in den Widget-Einstellungen.',
    es: 'Elija un trayecto en los ajustes del widget.',
  },
};

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

function formatTime(date, language, timezone) {
  return new Intl.DateTimeFormat(LOCALES[language], {
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
  const lang = toLanguage(language);
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

// --- "travel_times": every route as a list ---------------------------------

const LIST_T = {
  updated: {
    en: (ago) => `Updated ${ago}`,
    fr: (ago) => `Mis à jour ${ago}`,
    de: (ago) => `Aktualisiert ${ago}`,
    es: (ago) => `Actualizado ${ago}`,
  },
  justNow: { en: 'just now', fr: "à l'instant", de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: {
    en: (n) => `${n} min ago`,
    fr: (n) => `il y a ${n} min`,
    de: (n) => `vor ${n} Min.`,
    es: (n) => `hace ${n} min`,
  },
  at: {
    en: (time) => `at ${time}`,
    fr: (time) => `à ${time}`,
    de: (time) => `um ${time}`,
    es: (time) => `a las ${time}`,
  },
  never: {
    en: 'Not refreshed yet',
    fr: 'Pas encore actualisé',
    de: 'Noch nicht aktualisiert',
    es: 'Aún no actualizado',
  },
  via: { en: 'via', fr: 'par', de: 'über', es: 'por' },
  home: { en: 'Home', fr: 'Maison', de: 'Zuhause', es: 'Casa' },
  onTime: { en: 'On time', fr: "À l'heure", de: 'Pünktlich', es: 'A tiempo' },
  noReading: { en: 'No reading', fr: 'Pas de relevé', de: 'Kein Wert', es: 'Sin datos' },
  traffic: T.traffic,
  usual: { en: 'Usual', fr: 'Habituellement', de: 'Üblich', es: 'Habitual' },
  delay: T.delay,
  congestion: {
    en: (n) => `${n} % of the route congested`,
    fr: (n) => `${n} % du trajet encombré`,
    de: (n) => `${n} % der Strecke gestaut`,
    es: (n) => `${n} % del trayecto congestionado`,
  },
  updatedAt: T.updated,
  offHours: {
    en: 'Outside the active days/hours: not refreshed automatically.',
    fr: 'Hors des jours/heures actifs : pas d’actualisation automatique.',
    de: 'Außerhalb der aktiven Tage/Zeiten: keine automatische Aktualisierung.',
    es: 'Fuera de los días/horas activos: sin actualización automática.',
  },
  refreshAll: {
    en: 'Refresh all',
    fr: 'Tout actualiser',
    de: 'Alle aktualisieren',
    es: 'Actualizar todo',
  },
  noRoutes: {
    en: 'No route yet: configure your routes, then add them from the Discovery tab.',
    fr: "Aucun trajet : configurez vos trajets, puis ajoutez-les depuis l'onglet Découverte.",
    de: 'Noch keine Strecke: Konfigurieren Sie Ihre Strecken und fügen Sie sie über den Reiter „Erkennung“ hinzu.',
    es: 'Aún no hay trayectos: configure sus trayectos y añádalos desde la pestaña Descubrimiento.',
  },
};

function clip(text, max) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatNumber(value, language) {
  return new Intl.NumberFormat(LOCALES[language], {
    maximumFractionDigits: 1,
  }).format(value);
}

/** "just now", "12 min ago", or the clock time beyond an hour. */
function formatAgo(date, now, language, timezone) {
  const minutes = Math.floor((now - date) / 60_000);
  if (minutes < 1) return LIST_T.justNow[language];
  if (minutes < 60) return LIST_T.minutesAgo[language](minutes);
  return LIST_T.at[language](formatTime(date, language, timezone));
}

// "Retard : +5 min" in French, "Delay: +5 min" in English.
function line(label, value, lang) {
  return `${label}${lang === 'fr' ? ' :' : ':'} ${value}`;
}

function formatDelay(minutes) {
  return `${minutes >= 0 ? '+' : '−'}${Math.abs(Math.round(minutes))} min`;
}

/**
 * Google Maps directions link of the route (the points as resolved by the
 * last refresh), to open it on a map.
 */
export function mapsUrl({ origin, waypoints = [], destination }) {
  const point = ({ latitude, longitude }) =>
    `${Number(latitude.toFixed(5))},${Number(longitude.toFixed(5))}`;
  const params = new URLSearchParams({
    api: '1',
    origin: point(origin),
    destination: point(destination),
    travelmode: 'driving',
  });
  if (waypoints.length > 0) params.set('waypoints', waypoints.map(point).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

function badgeOf(analysis, lang) {
  if (!analysis) return { text: LIST_T.noReading[lang], color: WIDGET_COLORS.NEUTRAL };
  const color = LEVEL_COLORS[analysis.level];
  if (Math.round(analysis.delayMinutes) < 1) return { text: LIST_T.onTime[lang], color };
  return { text: formatDelay(analysis.delayMinutes), color };
}

function listItem({ route, result, active }, { lang, now, timezone }) {
  const analysis = result?.analysis;
  if (!analysis) {
    return {
      title: clip(route.name, 60),
      subtitle: LIST_T.never[lang],
      badge: badgeOf(undefined, lang),
    };
  }
  const subtitle = [
    `${Math.round(analysis.durationMinutes)} min`,
    `${formatNumber(analysis.distanceKm, lang)} km`,
    analysis.via ? `${LIST_T.via[lang]} ${analysis.via}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  // An empty origin starts from the home location of Gladys.
  const origin = route.origin ? result.origin.label : LIST_T.home[lang];
  const places = [...(result.waypoints ?? []), result.destination].map((place) => place.label);
  const details = [
    [origin, ...places].join(' → '),
    line(LIST_T.traffic[lang], TRAFFIC_LEVEL_LABELS[analysis.levelKey][lang], lang),
    line(LIST_T.usual[lang], `${Math.round(analysis.typicalMinutes)} min`, lang),
    line(
      LIST_T.delay[lang],
      `${formatDelay(analysis.delayMinutes)} (${analysis.delayPercent >= 0 ? '+' : ''}${analysis.delayPercent} %)`,
      lang,
    ),
    LIST_T.congestion[lang](analysis.congestionPercent),
    line(
      LIST_T.updatedAt[lang],
      `${formatTime(result.updatedAt, lang, timezone)} (${formatAgo(result.updatedAt, now, lang, timezone)})`,
      lang,
    ),
  ];
  if (!active) details.push(LIST_T.offHours[lang]);
  return {
    title: clip(route.name, 60),
    subtitle: clip(subtitle, 60),
    badge: badgeOf(analysis, lang),
    description: clip(details.join('\n'), 2000),
    links: [{ url: mapsUrl(result), label: 'Google Maps' }],
  };
}

/**
 * @param {object} options
 * @param {{ deviceExternalId: string, route: object, result?: object }[]} options.entries
 *   the routes to show, in order, with their last refresh result
 * @param {boolean} options.active whether the routes are refreshed right now
 *   (inside the active days/hours)
 * @param {string} options.language
 * @param {string} options.timezone
 * @param {Date} options.now
 * @param {number} options.ttlSeconds
 */
export function buildTravelTimesContent({ entries, active, language, timezone, now, ttlSeconds }) {
  const lang = toLanguage(language);
  if (entries.length === 0) {
    return {
      ttl_seconds: ttlSeconds,
      components: [{ type: 'text', variant: 'body', text: LIST_T.noRoutes[lang] }],
    };
  }
  const shown = entries.slice(0, MAX_LIST_ITEMS);
  const dates = shown.map((e) => e.result?.updatedAt).filter(Boolean);
  const latest = dates.length > 0 ? new Date(Math.max(...dates)) : undefined;
  return {
    ttl_seconds: ttlSeconds,
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: latest
          ? LIST_T.updated[lang](formatAgo(latest, now, lang, timezone))
          : LIST_T.never[lang],
      },
      {
        type: 'card-list',
        display: 'list',
        items: shown.map((entry) => listItem({ ...entry, active }, { lang, now, timezone })),
      },
      {
        type: 'button',
        label: LIST_T.refreshAll[lang],
        icon: 'refresh-cw',
        style: 'secondary',
        action: {
          key: LIST_WIDGET_REFRESH_ACTION,
          params: { routes: shown.map((e) => e.deviceExternalId) },
        },
      },
    ],
  };
}

// --- "mapbox_quota": the requests of the month against the free tier --------

const QUOTA_T = {
  directions: { en: 'Routes', fr: 'Itinéraires', de: 'Routen', es: 'Rutas' },
  geocoding: { en: 'Geocoding', fr: 'Géocodage', de: 'Geokodierung', es: 'Geocodificación' },
  used: {
    en: (api) => `${api} this month`,
    fr: (api) => `${api} ce mois-ci`,
    de: (api) => `${api} diesen Monat`,
    es: (api) => `${api} este mes`,
  },
  projected: {
    en: (api) => `${api} by month end`,
    fr: (api) => `${api} en fin de mois`,
    de: (api) => `${api} am Monatsende`,
    es: (api) => `${api} a fin de mes`,
  },
  tooEarly: {
    en: 'Too early to estimate',
    fr: 'Trop tôt pour estimer',
    de: 'Zu früh für eine Schätzung',
    es: 'Demasiado pronto para estimar',
  },
  since: {
    en: (date) => `Counted since ${date} · free tier: 100,000/month`,
    fr: (date) => `Compté depuis le ${date} · offert : 100 000/mois`,
    de: (date) => `Gezählt seit ${date} · kostenlos: 100.000/Monat`,
    es: (date) => `Contado desde el ${date} · gratis: 100.000/mes`,
  },
  account: { en: 'Mapbox account', fr: 'Compte Mapbox', de: 'Mapbox-Konto', es: 'Cuenta Mapbox' },
};

// Share of the free tier from which the gauge turns orange.
const QUOTA_WARNING_RATIO = 0.8;

function quotaColor(ratio) {
  if (ratio >= 1) return WIDGET_COLORS.DANGER;
  if (ratio >= QUOTA_WARNING_RATIO) return WIDGET_COLORS.WARNING;
  return WIDGET_COLORS.SUCCESS;
}

/**
 * @param {object} options
 * @param {ReturnType<ReturnType<typeof import('./usage.js').createUsageCounter>['snapshot']>} options.snapshot
 * @param {string} options.language
 * @param {string} options.timezone
 * @param {number} options.ttlSeconds
 */
export function buildQuotaContent({ snapshot, language, timezone, ttlSeconds }) {
  const lang = toLanguage(language);
  const integer = (value) =>
    new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: 0 }).format(value);
  const percent = (value, free) => `${integer((value / free) * 100)} %`;
  const [year, month] = snapshot.month.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat(LOCALES[lang], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(year, month - 1, 15));
  const since = new Intl.DateTimeFormat(LOCALES[lang], {
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(snapshot.since);

  const gauges = [];
  const items = [];
  for (const api of [USAGE_APIS.DIRECTIONS, USAGE_APIS.GEOCODING]) {
    const { used, free, projected } = snapshot.apis[api];
    const name = QUOTA_T[api][lang];
    gauges.push({
      type: 'gauge',
      value: Math.min(used, free),
      min: 0,
      max: free,
      label: name,
      color: quotaColor(Math.max(used, projected ?? 0) / free),
    });
    items.push({
      label: QUOTA_T.used[lang](name),
      value: `${integer(used)} / ${integer(free)} (${percent(used, free)})`,
      color: quotaColor(used / free),
    });
    items.push({
      label: QUOTA_T.projected[lang](name),
      value:
        projected === null
          ? QUOTA_T.tooEarly[lang]
          : `≈ ${integer(projected)} (${percent(projected, free)})`,
      color: projected === null ? WIDGET_COLORS.NEUTRAL : quotaColor(projected / free),
    });
  }

  return {
    ttl_seconds: ttlSeconds,
    components: [
      { type: 'text', variant: 'heading', text: monthName[0].toUpperCase() + monthName.slice(1) },
      { type: 'text', variant: 'caption', text: QUOTA_T.since[lang](since) },
      ...gauges,
      { type: 'status', items },
      {
        type: 'button',
        label: QUOTA_T.account[lang],
        icon: 'external-link',
        style: 'secondary',
        link: { url: 'https://account.mapbox.com/' },
      },
    ],
  };
}
