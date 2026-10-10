# Mapbox Traffic

Track the travel time of your usual routes (home → work, school…) with live
traffic, see it as a chart and get notified of traffic jams or abnormally long
trips. Data comes from the
[Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
(`driving-traffic` profile).

## What you get

One **route** device per configured route (up to 3), with:

| Feature           | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| Travel time       | Duration with the current traffic, in minutes (kept in history) |
| Usual travel time | Typical duration at this time of the week according to Mapbox   |
| Delay             | Difference between both, in minutes                             |
| Distance          | Length of the recommended route, in km                          |
| Traffic level     | 0 fluid, 1 moderate, 2 traffic jam, 3 severe jam                |
| Traffic           | The same level as a text                                        |
| Via               | The main roads taken ("A86, A1")                                |

Plus:

- a **dashboard widget** "Travel time": duration, delay, chart of the current
  vs usual travel time, traffic status and a "Refresh" button;
- four **scene triggers**: _Traffic jam on a route_, _Traffic jam cleared_,
  _Abnormally long travel time_, _Travel time back to normal_;
- a **scene action** _Get the travel time of a route_, e.g. to send "32 min (+7
  min) · Moderate" every morning.

## Setup

1. Create a free account on [mapbox.com](https://account.mapbox.com/) and copy
   your **default public access token** (it starts with `pk.`). The free tier
   includes 100,000 route requests a month.
2. In the integration **Configuration** tab, paste the token.
3. Fill in at least **route 1**:
   - **Name**: "Work" for instance;
   - **Origin**: leave empty to start from the home location set in Gladys
     (Settings → Houses), or type an address or coordinates;
   - **Destination**: an address or "latitude, longitude" coordinates
     ("48.8924, 2.2369", as copied from Google Maps with a right click).
4. Click **Test Mapbox**: the current travel time of route 1 shows under the
   button.
5. Open the **Discovery** tab and add your routes.

### Refresh

- **Interval**: 300 s by default (60 s minimum).
- **Active days** / **Active hours**: only query Mapbox when it matters, e.g.
  Monday to Friday, `07:00-09:30, 16:30-19:00`. Empty means always. Hours are
  read in the configured **timezone** (`Europe/Paris` by default).
- **Avoid**: tolls, motorways, ferries.

### Mapbox free plan

The Directions API includes **100,000 free requests a month**; beyond that,
Mapbox bills the extra requests (see the
[Mapbox pricing](https://www.mapbox.com/pricing#directions-api)). The
integration makes one request per route at every refresh, and geocodes each
address only once. Monthly usage ≈ routes × refreshes per hour × active hours
per day × days.

For example, 3 routes refreshed every 5 minutes for 5 hours each working day
use about 4,000 requests a month, and about 26,000 when refreshed all day long:
both stay within the free plan. Refreshing 3 routes every minute, 24/7, uses
about 130,000 requests and goes over it.

Your actual usage is shown in your [Mapbox account](https://account.mapbox.com/).

### Alerts

- **Traffic jam**: at least 10 % (configurable) of the distance is in heavy
  congestion according to Mapbox, or the trip is clearly longer than usual
  (+35 %).
- **Abnormally long**: the travel time exceeds the usual one by 30 % **and**
  by at least 5 minutes (both configurable), so a short trip going from 4 to
  6 minutes does not alert.

## Scene examples

- **Traffic jam alert**: trigger _Traffic jam on a route_ (route "Work"),
  action "Send a message": `Jam to work: {{triggerEvent.data.summary}}`.
- **Morning briefing**: at 7 a.m. on weekdays, action _Get the travel time of
  a route_, then "Send a message" with the _Summary_ (or _Travel time (min)_)
  variable produced by the previous action.
- **Personal threshold**: the route is a standard Gladys device, so the
  native "Device value" trigger works too: "when Travel time (Work) > 45".

Event triggers only fire on a **change** (a single "Traffic jam" while the jam
lasts).

## Troubleshooting

- **"Mapbox refused the access token"**: check the token on
  [account.mapbox.com](https://account.mapbox.com/access-tokens/).
- **Address not found**: use a more complete address, or coordinates.
- **"the home has no location"**: set the home location in Gladys, or fill in
  the origin.
- The integration logs (Logs tab, or `docker logs`) detail every refresh; set
  `LOG_LEVEL=debug` to see the requests (the token is masked).
