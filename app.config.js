// OVspot V1.1 gescheiden preview. Geen wijzigingen aan het productie-app-ID.
module.exports = ({ config }) => ({
  ...config,
  name: "OVspot Preview",
  version: "1.1.0",
  android: { ...config.android, package: "nl.ovspot.preview", versionCode: 1 },
  extra: { ...config.extra, apiBase: "https://ovspot.nl/app/v1-preview" },
});
