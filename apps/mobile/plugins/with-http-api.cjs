const { withAndroidManifest } = require("expo/config-plugins");

// Internal builds can use a LAN/Tailnet HTTP server. HTTPS configurations retain Android's
// default network policy; this is derived from the same URL the client actually uses.
module.exports = function withHttpApi(config) {
  return withAndroidManifest(config, (config) => {
    if (config.extra?.apiUrl?.startsWith("http://")) {
      for (const application of config.modResults.manifest.application ?? []) {
        application.$["android:usesCleartextTraffic"] = "true";
      }
    }
    return config;
  });
};
