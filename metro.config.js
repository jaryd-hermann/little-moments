const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push("mjs", "cjs");
// D3 source is bundled as a .txt asset (assets/d3-v7-min.txt) and read at
// runtime via expo-asset + expo-file-system — so `require()` returns an asset
// reference rather than executing D3 at app start.
config.resolver.assetExts.push("txt");

module.exports = withNativeWind(config, { input: "./global.css" });
