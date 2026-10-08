// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the integration relies on:
//   - externalIds(type, platformId) -> { device, feature(key) }
//   - devices                        -> the devices "created" by the user
//   - publishStates / publishSceneEvent / setConnectionStatus -> record calls
// -----------------------------------------------------------------------------

export function createFakeGladys({ devices = [] } = {}) {
  const published = [];
  const sceneEvents = [];
  const connectionStatuses = [];

  return {
    devices,
    published,
    sceneEvents,
    connectionStatuses,

    externalIds(type, platformId) {
      const device = `ext:mapbox-traffic:${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    async publishStates(states) {
      for (const s of states) {
        published.push({ featureExternalId: s.device_feature_external_id, state: s.state });
      }
    },

    async publishSceneEvent(key, data) {
      sceneEvents.push({ key, data });
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },
  };
}
