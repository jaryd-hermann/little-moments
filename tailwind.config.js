module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        baskerville: ["LibreBaskerville-Regular"],
        "baskerville-bold": ["LibreBaskerville-Bold"],
        "baskerville-italic": ["LibreBaskerville-Italic"],
        ui: ["Roboto-Regular"],
        "ui-light": ["Roboto-Light"],
        "ui-medium": ["Roboto-Medium"],
      },
      colors: {
        lm: {
          black: "#000000",
          surface1: "#0A0A0A",
          surface2: "#1A1A1A",
          accent: "#f0d7ff",
        },
      },
    },
  },
  plugins: [],
};
