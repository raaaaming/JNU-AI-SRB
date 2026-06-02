module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo handles expo-router transforms in SDK 50+.
    // The standalone 'expo-router/babel' plugin is deprecated/removed.
    presets: ['babel-preset-expo'],
  };
};
