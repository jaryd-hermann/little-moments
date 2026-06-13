const { withPodfile } = require("expo/config-plugins");

const TAG = "LM_GOOGLE_MODULAR_HEADERS";

/**
 * Google Sign-In pulls in AppCheckCore (Swift), which depends on
 * GoogleUtilities and RecaptchaInterop. With static linking those pods do not
 * ship module maps unless modular headers are enabled — pod install fails on
 * EAS with:
 *   "The Swift pod AppCheckCore depends upon GoogleUtilities and RecaptchaInterop,
 *    which do not define modules."
 */
function withGoogleModularHeaders(config) {
  return withPodfile(config, (cfg) => {
    if (cfg.modResults.contents.includes(TAG)) {
      return cfg;
    }

    cfg.modResults.contents = cfg.modResults.contents.replace(
      /use_expo_modules!/,
      `use_expo_modules!

  # ${TAG}
  pod 'GoogleUtilities', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true`
    );

    return cfg;
  });
}

module.exports = withGoogleModularHeaders;
