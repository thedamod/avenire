module.exports = function (api) {
  api.cache(true);
  return {
    // Configure the Worklets plugin explicitly below instead of Expo's auto-detection.
    presets: [["babel-preset-expo", { worklets: false, reanimated: false }]],
    plugins: ["react-native-worklets/plugin"],
  };
};
