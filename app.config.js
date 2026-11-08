// Expo's app.json is static JSON and cannot evaluate process.env.
// Resolve the Android Maps SDK key at native build time via EAS preview environment.
const API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/;

module.exports = ({ config }) => {
  const apiKey = (
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();

  if (apiKey && !API_KEY_PATTERN.test(apiKey)) {
    throw new Error("Android Google Maps API-key heeft geen geldig formaat.");
  }
  if (!apiKey && (process.env.EAS_BUILD === "true" || process.env.EAS_BUILD_PROFILE)) {
    throw new Error("Google Maps API-key ontbreekt in EAS preview (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).");
  }

  const plugins = (config.plugins ?? []).filter((plugin) =>
    (typeof plugin === "string" ? plugin : plugin[0]) !== "react-native-maps"
  );

  return {
    ...config,
    android: {
      ...config.android,
      ...(apiKey ? {
        config: {
          ...config.android?.config,
          googleMaps: {
            ...config.android?.config?.googleMaps,
            apiKey,
          },
        },
      } : {}),
    },
    plugins: [
      ...plugins,
      ["react-native-maps", {
        ...(apiKey ? { androidGoogleMapsApiKey: apiKey } : {}),
      }],
    ],
  };
};
