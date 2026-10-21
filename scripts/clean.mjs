#!/usr/bin/env node
/**
 * Remove every build artefact from the project.
 *
 * The Rust and Gradle build directories grow to several gigabytes. They are
 * all regenerated on the next build, so removing them costs nothing but a
 * slower next build.
 *
 * Usage: npm run clean
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Paths to delete, relative to the project root. */
const TARGETS = [
  "dist",
  "dist-preview",
  "src-tauri/target",
  "src-tauri/gen/android/.gradle",
  "src-tauri/gen/android/build",
  "src-tauri/gen/android/app/build",
  "src-tauri/gen/android/app/.cxx",
  "src-tauri/gen/android/buildSrc/build",
  // Symlinks into src-tauri/target, which we are about to delete.
  "src-tauri/gen/android/app/src/main/jniLibs",
];

function sizeOf(path) {
  if (!existsSync(path)) return 0;
  const { size } = statSync(path);
  return size;
}

function human(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)}${units[unit]}`;
}

console.log("Cleaning build artefacts...\n");

for (const target of TARGETS) {
  const path = join(root, target);
  if (!existsSync(path)) continue;
  rmSync(path, { recursive: true, force: true });
  console.log(`  removed  ${target}`);
}

// `cargo clean` catches anything the list above missed.
if (existsSync(join(root, "src-tauri/target"))) {
  execFileSync("cargo", ["clean"], { cwd: join(root, "src-tauri"), stdio: "ignore" });
  console.log("  removed  src-tauri/target (cargo clean)");
}

console.log("\nDone. The next build will be slower while everything recompiles.");
console.log("Your source, the Android project and release/ are untouched.");
