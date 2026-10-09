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

    // Same validation as the host API (POST /state): each entry carries
    // either a finite numeric `state` or a string `text`.
    async publishStates(states) {
      states.forEach((s, i) => {
        const numeric = typeof s.state === 'number' && Number.isFinite(s.state);
        const text = typeof s.text === 'string';
        if (numeric === text) {
          throw new Error(`states[${i}]: must have a numeric "state" or a string "text"`);
        }
      });
      for (const s of states) {
        published.push({
          featureExternalId: s.device_feature_external_id,
          state: s.text !== undefined ? { text: s.text } : s.state,
        });
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
