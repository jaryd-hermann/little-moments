/**
 * Home screen widget target, generated into the Xcode project by
 * `@bacons/apple-targets` on every `expo prebuild`. Nothing here ends up in
 * `/ios` permanently — that directory is gitignored and regenerated.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => {
  const appGroup = config.extra?.widgetAppGroup;
  if (!appGroup) {
    throw new Error(
      "[targets/widget] extra.widgetAppGroup is missing from app.config.ts. " +
        "Without it the widget has no shared container to read and would " +
        "render empty on every device."
    );
  }

  return {
    type: "widget",
    // Must not collide with the main app's product name ("LittleMoments")
    // once spaces are stripped, or the generated target is dropped.
    name: "LittleMomentsWidget",
    icon: "../../assets/images/icon.png",
    // Declared explicitly instead of inheriting the app's list: the main app
    // also holds the OneSignal group, and the widget has no reason to see it.
    // Must stay identical to the identifier `lib/widgetSnapshot.ts` writes to
    // and the one hardcoded in `index.swift`.
    entitlements: {
      "com.apple.security.application-groups": [appGroup],
    },
    colors: {
      $accent: "#f0d7ff",
      $widgetBackground: "#000000",
    },
  };
};
