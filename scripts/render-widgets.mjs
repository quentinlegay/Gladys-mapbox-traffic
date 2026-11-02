// -----------------------------------------------------------------------------
// Illustrations of the dashboard widgets: docs/assets/widgets.<lang>.png.
//
// The content of every widget is built by the integration's own code
// (src/widget.js) from sample routes, then drawn by a small renderer that
// imitates the Gladys dashboard card (header, tiles, focal component,
// status, buttons) and captured with Playwright. It is an illustration of
// what the core receives, not a screenshot of Gladys.
//
//   npm install --no-save playwright
//   node scripts/render-widgets.mjs
// -----------------------------------------------------------------------------

import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  buildQuotaContent,
  buildTravelTimesContent,
  buildWidgetContent,
  LIST_WIDGET_KEY,
  QUOTA_WIDGET_KEY,
  WIDGET_KEY,
} from '../src/widget.js';

const ROOT = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('gladys-assistant-integration.json', ROOT)));
const NOW = new Date('2026-11-16T07:42:00Z');
const TIMEZONE = 'Europe/Paris';

// --- Sample data ------------------------------------------------------------

const NAMES = {
  work: { en: 'Work', fr: 'Travail' },
  airport: { en: 'Airport', fr: 'Aéroport' },
  school: { en: 'School', fr: 'Lycée' },
  family: { en: 'Grandparents', fr: 'Grands-parents' },
};

// [key, minutes now, usual minutes, km, main roads, level, congested %]
const ROUTES = [
  ['work', 38, 24, 11.8, 'M6, A6', 2, 34],
  ['airport', 31, 27, 29.4, 'A46, N346', 1, 12],
  ['school', 17, 17, 4.6, 'Quai Clemenceau', 0, 0],
  ['family', 92, 91, 138.2, 'A43, A41', 0, 2],
];
const LEVEL_KEYS = ['fluid', 'moderate', 'heavy', 'severe'];

function sampleEntry([key, duration, typical, km, via, level, congestion], lang, index) {
  const point = (latitude, longitude, label) => ({ latitude, longitude, label });
  return {
    deviceExternalId: `route-${index + 1}`,
    route: { name: NAMES[key][lang], origin: '' },
    result: {
      updatedAt: new Date(NOW - 2 * 60_000),
      origin: point(45.79, 4.85, 'home'),
      waypoints: [],
      destination: point(45.76, 4.86, 'Lyon'),
      analysis: {
        durationMinutes: duration,
        typicalMinutes: typical,
        delayMinutes: duration - typical,
        delayPercent: Math.round((duration / typical - 1) * 100),
        distanceKm: km,
        via,
        level,
        levelKey: LEVEL_KEYS[level],
        congestionPercent: congestion,
      },
    },
  };
}

// The travel time over the last 24 hours: a morning and an evening peak.
function dayProfile(usual, peak) {
  return Array.from({ length: 97 }, (_, i) => {
    const hour = i / 4;
    const bump = (center, width) => Math.exp(-((hour - center) ** 2) / (2 * width ** 2));
    return usual + (peak - usual) * Math.max(bump(8.4, 1.3), 0.8 * bump(17.8, 1.6));
  });
}

function contents(lang) {
  const entries = ROUTES.map((route, i) => sampleEntry(route, lang, i));
  const work = entries[0];
  return [
    {
      key: LIST_WIDGET_KEY,
      content: buildTravelTimesContent({
        entries,
        active: true,
        language: lang,
        timezone: TIMEZONE,
        now: NOW,
        ttlSeconds: 60,
      }),
    },
    {
      key: WIDGET_KEY,
      content: buildWidgetContent({
        deviceExternalId: 'route-1',
        route: work.route,
        result: work.result,
        interval: 'last-day',
        language: lang,
        timezone: TIMEZONE,
        ttlSeconds: 60,
      }),
      // The tiles and the chart are bound to device features: sample states.
      features: {
        'route-1:duration': { value: 38, series: dayProfile(24, 38) },
        'route-1:typical-duration': { value: 24, series: dayProfile(24, 31) },
        'route-1:delay': { value: 14 },
      },
    },
    {
      key: QUOTA_WIDGET_KEY,
      content: buildQuotaContent({
        snapshot: {
          month: '2026-11',
          since: new Date('2026-11-01T00:00:00Z'),
          apis: {
            directions: { used: 6480, free: 100000, projected: 12960 },
            geocoding: { used: 7, free: 100000, projected: 14 },
          },
        },
        language: lang,
        timezone: TIMEZONE,
        ttlSeconds: 60,
      }),
    },
  ];
}

// --- Renderer -----------------------------------------------------------------

const ICONS = {
  navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  'bar-chart-2':
    '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'alert-triangle':
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'refresh-cw':
    '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  'external-link':
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
};
const COLORS = {
  neutral: '#626976',
  primary: '#206bc4',
  success: '#2fb344',
  warning: '#f59f00',
  danger: '#d63939',
  info: '#4299e1',
};
const CHART_COLORS = ['#206bc4', '#a8aeb7'];

const escape = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const icon = (name, color = 'currentColor', size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
const localized = (value, lang) => (typeof value === 'object' ? (value[lang] ?? value.en) : value);
const number = (value, lang) =>
  new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB').format(value);

function renderGauge(c, lang) {
  const ratio = Math.min(1, Math.max(0, (c.value - c.min) / (c.max - c.min)));
  // A 270° arc, open at the bottom.
  const arc = (to) => {
    const angle = (deg) => ((deg - 225) * Math.PI) / 180;
    const [x0, y0] = [50 + 40 * Math.cos(angle(0)), 50 + 40 * Math.sin(angle(0))];
    const [x1, y1] = [50 + 40 * Math.cos(angle(to)), 50 + 40 * Math.sin(angle(to))];
    return `M ${x0} ${y0} A 40 40 0 ${to > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const color = COLORS[c.color ?? 'primary'];
  return `<div class="tile"><svg width="120" height="104" viewBox="0 0 100 88">
    <path d="${arc(270)}" stroke="#e1e4e9" stroke-width="9" fill="none" stroke-linecap="round"/>
    ${ratio > 0 ? `<path d="${arc(Math.max(270 * ratio, 1))}" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round"/>` : ''}
    <text x="50" y="58" text-anchor="middle" class="gauge-value">${number(c.value, lang)}</text></svg>
    <div class="tile-label">${escape(localized(c.label, lang))}</div></div>`;
}

function renderValue(c, lang, features) {
  const value = c.device_feature ? features[c.device_feature]?.value : c.value;
  const color = COLORS[c.color ?? 'neutral'];
  return `<div class="tile">${icon(c.icon, color, 22)}
    <div><span class="tile-value" style="color:${color}">${escape(value)}</span><span class="tile-unit">min</span></div>
    <div class="tile-label">${escape(localized(c.label, lang))}</div></div>`;
}

function renderChart(c, lang, features) {
  const series = c.device_features.map((id) => features[id]?.series ?? []);
  const all = series.flat();
  const [min, max] = [Math.min(...all) - 4, Math.max(...all) + 4];
  const [w, h] = [496, 150];
  const path = (values) =>
    values
      .map(
        (v, i) =>
          `${i ? 'L' : 'M'} ${(i / (values.length - 1)) * w} ${h - ((v - min) / (max - min)) * h}`,
      )
      .join(' ');
  const grid = [0.25, 0.5, 0.75]
    .map((r) => `<line x1="0" x2="${w}" y1="${h * r}" y2="${h * r}" stroke="#eef0f3"/>`)
    .join('');
  return `<div class="chart"><div class="chart-title">${escape(localized(c.title, lang))}</div>
    <svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" height="${h}">${grid}
    ${series.map((s, i) => `<path d="${path(s)}" stroke="${CHART_COLORS[i]}" stroke-width="2.5" fill="none"/>`).join('')}</svg></div>`;
}

function renderComponent(c, lang, features) {
  switch (c.type) {
    case 'text':
      return `<div class="text-${c.variant}">${escape(localized(c.text, lang))}</div>`;
    case 'value':
      return renderValue(c, lang, features);
    case 'gauge':
      return renderGauge(c, lang);
    case 'chart':
      return renderChart(c, lang, features);
    case 'status':
      return `<div class="status">${c.items
        .map(
          (
            item,
          ) => `<div class="status-row"><span class="dot" style="background:${COLORS[item.color ?? 'neutral']}"></span>
          <span class="status-label">${escape(localized(item.label, lang))}</span>
          <span class="status-value">${escape(localized(item.value, lang))}</span></div>`,
        )
        .join('')}</div>`;
    case 'card-list':
      return `<div class="cards">${c.items
        .map(
          (item) => `<div class="card-row"><div class="card-title">${escape(item.title)}</div>
          <div class="card-subtitle">${escape(item.subtitle ?? '')}</div>
          ${item.badge ? `<span class="badge badge-${item.badge.color ?? 'neutral'}">${escape(item.badge.text)}</span>` : ''}</div>`,
        )
        .join('')}</div>`;
    case 'button':
      return `<span class="button">${icon(c.icon, COLORS.primary, 18)}${escape(localized(c.label, lang))}</span>`;
    default:
      return '';
  }
}

// The core renders the slots in a canonical order, whatever the order sent.
const SLOTS = [
  ['text'],
  ['value', 'gauge'],
  ['chart', 'card-list', 'image'],
  ['status'],
  ['button'],
];

function renderWidget({ key, content, features = {} }, lang) {
  const declared = manifest.widgets.find((w) => w.key === key);
  const body = SLOTS.map((types, slot) => {
    const html = content.components
      .filter((c) => types.includes(c.type))
      .map((c) => renderComponent(c, lang, features))
      .join('');
    if (!html) return '';
    return `<div class="slot slot-${slot}">${html}</div>`;
  }).join('');
  return `<div class="widget"><div class="widget-header">${icon(declared.icon, '#4f5663', 24)}
    <span>${escape(localized(declared.label, lang))}</span></div><div class="widget-body">${body}</div></div>`;
}

const STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #f5f7fb; color: #232e3c;
    font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
  .grid { display: grid; grid-template-columns: 570px 570px; gap: 36px; align-items: start; }
  .column { display: grid; gap: 36px; }
  .widget { background: #fff; border: 1px solid #e6e7e9; border-radius: 4px;
    box-shadow: 0 1px 2px rgba(35, 46, 60, .04); }
  .widget-header { display: flex; align-items: center; gap: 10px; padding: 24px 36px;
    border-bottom: 1px solid #e6e7e9; font-size: 26px; color: #353e4b; }
  .widget-body { padding: 26px 36px 36px; }
  .slot + .slot { margin-top: 18px; }
  .slot-0 { padding-bottom: 18px; border-bottom: 1px solid #e6e7e9; }
  .slot-1 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .text-heading { font-size: 21px; font-weight: 600; color: #353e4b; margin-top: 10px; }
  .text-caption, .text-body { font-size: 18px; color: #656d77; margin-top: 8px; }
  .tile { background: #f4f5f7; border: 1px solid #e6e7e9; border-radius: 10px; padding: 16px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .tile-value { font-size: 30px; font-weight: 700; }
  .tile-unit { font-size: 17px; color: #656d77; margin-left: 3px; }
  .tile-label { font-size: 17px; color: #656d77; }
  .gauge-value { font-size: 15px; font-weight: 700; fill: #353e4b; }
  .chart-title { font-size: 16px; color: #656d77; margin-bottom: 8px; }
  .cards { display: grid; gap: 14px; }
  .card-title { font-size: 19px; font-weight: 600; color: #353e4b; }
  .card-subtitle { font-size: 17px; color: #656d77; margin: 4px 0 6px; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 15px; font-weight: 700; }
  .badge-success { background: #e3f4e6; color: #237a34; }
  .badge-warning { background: #fdedd1; color: #8a5a00; }
  .badge-danger { background: #f9dfdf; color: #a32222; }
  .badge-info { background: #e1eefb; color: #1f5f99; }
  .badge-neutral { background: #eceef1; color: #4f5663; }
  .status { display: grid; gap: 14px; }
  .status-row { display: flex; align-items: center; gap: 12px; font-size: 18px; }
  .dot { width: 11px; height: 11px; border-radius: 50%; flex: none; }
  .status-label { color: #656d77; }
  .status-value { margin-left: auto; font-weight: 700; color: #353e4b; white-space: nowrap; }
  .button { display: inline-flex; align-items: center; gap: 10px; padding: 14px 22px; border: 1px solid #dadfe5;
    border-radius: 12px; font-size: 19px; font-weight: 700; color: #353e4b; }
`;

function page(lang) {
  const [list, single, quota] = contents(lang).map((widget) => renderWidget(widget, lang));
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${STYLE}</style></head>
    <body><div class="grid"><div class="column">${list}${quota}</div><div class="column">${single}</div></div></body></html>`;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
try {
  const tab = await browser.newPage({ viewport: { width: 1240, height: 800 } });
  for (const lang of ['en', 'fr']) {
    await tab.setContent(page(lang));
    const path = new URL(`docs/assets/widgets.${lang}.png`, ROOT);
    await tab.screenshot({ path: path.pathname, fullPage: true });
    console.log(`Written ${path.pathname}`);
  }
} finally {
  await browser.close();
}
