import { defineConfig } from "vite";

// Tauri expects a fixed port and a clean console so Rust errors stay visible.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    outDir: "dist",
    minify: false,
    sourcemap: true,
  },
});
