# Changelog

All notable changes to this integration are documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The single-route widget is now called **Trip** (Trajet, Strecke, Trayecto)
  so that it is not confused with the **Travel times** list widget. Its key
  stays `travel_time`: widgets already on a dashboard keep working.
- The **Trip** widget formats the distance in the user's language
  ("11,8 km" in French).

### Documentation

- The README is now in English, with the integration cover and a screenshot of
  the three widgets.
- New `CHANGELOG.md`.

## [1.2.0] - 2026-11-02

### Added

- **Travel times** widget: every route at a glance (travel time, distance,
  main roads and a delay badge colored by the traffic). Tapping a route opens
  its details (path with the waypoints, usual duration, delay, congested share,
  last update) and a Google Maps link; **Refresh all** refreshes every route
  shown. A setting picks the routes to show (empty: all of them).
- **Mapbox quota** widget: the Mapbox requests of the month against the free
  tier (100,000 Directions and 100,000 Geocoding requests), and the projection
  at the end of the month at the current pace. The integration counts its own
  successful requests in `/data/usage.json`, reset every calendar month (UTC).

### Fixed

- The Docker image creates `/data` owned by the `node` user, so the
  integration can write to its volume.

## [1.1.2] - 2026-10-14

### Fixed

- The Spanish description of the manifest exceeded the 100-character limit of
  the store: the indexer rejected the manifest and 1.1.1 never reached Gladys
  instances. The CI now runs the store's admission checks.

## [1.1.1] - 2026-10-14

### Added

- German and Spanish translations: manifest, device features, traffic status,
  widget, Configuration buttons and user documentation (`docs/de.md`,
  `docs/es.md`).

### Changed

- `@gladysassistant/integration-sdk` updated to 0.15.0.

## [1.1.0] - 2026-10-12

### Added

- **Go through** field on each route: up to 3 places (addresses or
  coordinates) separated by `;`, to follow your own way instead of the fastest
  one. The **Test Mapbox** button shows the full path, and the route device
  lists the waypoints. No extra Mapbox request.

## [1.0.3] - 2026-10-12

### Added

- The manifest declares the `cloud` transport: the integration is listed under
  the Cloud filter of the Gladys integration catalog.

## [1.0.2] - 2026-10-10

### Changed

- Clearer description of the integration in the store.

### Fixed

- The release workflow keeps the manifest formatted with Prettier.

## [1.0.1] - 2026-10-10

### Added

- "Mapbox free plan" section in the configuration screen and the user docs:
  the 100,000 free requests a month, how the integration uses them, and
  examples.

### Changed

- Clearer label for the optional route origin ("leave empty to start from your
  home").

### Fixed

- Gladys rejected the route device (HTTP 422): the text features now declare a
  min/max.
- Every refresh failed to publish the text states (traffic status, main
  roads): they are now sent in the format the host API expects.

## [1.0.0] - 2026-10-08

### Added

- First release: travel time of up to 3 routes with live traffic through the
  Mapbox Directions API, usual travel time and delay, traffic jam detection
  from the Mapbox congestion annotations, active days and hours, a **Travel
  time** dashboard widget with a chart, 4 scene triggers and 1 scene action.

[Unreleased]: https://github.com/quentinlegay/Gladys-mapbox-traffic/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/quentinlegay/Gladys-mapbox-traffic/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/quentinlegay/Gladys-mapbox-traffic/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/quentinlegay/Gladys-mapbox-traffic/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/quentinlegay/Gladys-mapbox-traffic/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/quentinlegay/Gladys-mapbox-traffic/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/quentinlegay/Gladys-mapbox-traffic/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/quentinlegay/Gladys-mapbox-traffic/compare/v0.0.1...v1.0.1
[1.0.0]: https://github.com/quentinlegay/Gladys-mapbox-traffic/releases/tag/v0.0.1
