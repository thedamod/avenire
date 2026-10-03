const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");
config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];
config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: true,
  nodeModulesPaths: [
    path.join(__dirname, "node_modules"),
    path.join(workspaceRoot, "node_modules"),
  ],
};

module.exports = withUniwindConfig(config, { cssEntryFile: "./global.css" });
