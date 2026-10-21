import { defineConfig } from "vite";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = __dirname;

/**
 * Regenerate dev/mock.html from index.html on every build.
 *
 * mock.html is the preview harness's copy of the app shell. Keeping it as a
 * generated file (rather than a hand-maintained duplicate) means it can never
 * drift out of sync with index.html.
 */
function generateMockHtml() {
  return {
    name: "pomodoro:generate-mock-html",
    config() {
      const source = readFileSync(resolve(ROOT, "index.html"), "utf8");
      const needle = '<script type="module" src="/src/main.js"></script>';
      if (!source.includes(needle)) {
        throw new Error("index.html no longer contains the main.js script tag");
      }
      const patched = source.replace(
        needle,
        `<script type="module" src="/dev/mock-bootstrap.js"></script>\n    ${needle}`
      );
      writeFileSync(resolve(ROOT, "dev/mock.html"), patched);
    },
  };
}

// A separate build for the UI preview harness in dev/mock.html. Building
// statically (rather than using the dev server) keeps previews deterministic:
// no HMR websocket, no on-the-fly dependency re-optimisation.
export default defineConfig({
  clearScreen: false,
  plugins: [generateMockHtml()],
  build: {
    outDir: "dist-preview",
    emptyOutDir: true,
    target: "es2021",
    minify: false,
    rollupOptions: {
      input: { mock: resolve(ROOT, "dev/mock.html") },
    },
  },
});
