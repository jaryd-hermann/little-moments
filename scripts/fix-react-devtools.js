/**
 * Postinstall workaround for React DevTools compatibility with React 19.
 * This silences spurious warnings that can appear in development.
 */
try {
  const fs = require("fs");
  const path = require("path");
  const devtoolsPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "react-devtools-core",
    "dist",
    "backend.js"
  );
  if (fs.existsSync(devtoolsPath)) {
    let content = fs.readFileSync(devtoolsPath, "utf8");
    if (content.includes("react.element")) {
      content = content.replace(
        /console\.error\("react\.element"/g,
        '// patched: console.error("react.element"'
      );
      fs.writeFileSync(devtoolsPath, content);
    }
  }
} catch {
  // Silently ignore — this is a best-effort patch
}
