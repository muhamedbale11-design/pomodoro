# Pomodoro

[![CI](https://github.com/muhamedbale11-design/pomodoro/actions/workflows/ci.yml/badge.svg)](https://github.com/muhamedbale11-design/pomodoro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-coral.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/tauri-2-blue.svg)](https://tauri.app)
[![Rust](https://img.shields.io/badge/rust-stable-orange.svg)](https://www.rust-lang.org)

A focus timer desktop app built with **Tauri** (Rust backend + vanilla JS frontend), with a
glassmorphic UI, a to-do list, and a flexible goal tracker. Runs on macOS, Windows, Linux
and Android.

## Features

### Timer
- **Classic cycle** — 25 min focus, 5 min short break, 15 min long break every 4 rounds.
  Every duration is configurable.
- **Auto-advance** — phases move on automatically (toggleable).
- **Pause / skip / reset** — full manual control, plus a session-dot indicator.
- **Sound + notifications** — a chime and a native macOS notification when a phase ends.
- **Daily target** — configurable pomodoros-per-day goal with a live progress bar.

### To-do list
- Add, complete, delete, and reorder-by-priority tasks.
- **Priority** (none / low / medium / high), **due date** with overdue & due-soon badges.
- **Notes** and **subtasks** (checklist) per task.
- One task can be the **active** focus — completed pomodoros are counted against it.

### Goals
- Flexible goals measured in **pomodoros** or **focus hours**.
- **All-time** or **daily** scope, with an optional deadline.
- Live progress bars, percentage, and an "Achieved" badge when the target is met.

### Stats
- Today: pomodoros, focus time, tasks completed.
- All-time totals.
- A 7-day bar chart of pomodoros.

### Control
- **Themes** — four built in: *Glass Dark*, *Glass Light*, *Aurora*, *Solid Dark*
  (solid is a low-spec fallback with no blur).
- **Accent colour** — six accent colours.
- **Glass tuning** — a **blur** slider (0–40px) and a **glass opacity** slider
  (0–100%). Drop the opacity to 0% and the panels disappear entirely, letting
  the background show through so you can match it to any wallpaper.
- **Keyboard shortcuts** — `Space` start/pause, `S` skip, `R` reset, `N` new task,
  `1`–`4` switch tab, `Esc` close dialog.
- **Menu bar tray** — the app lives in the macOS status bar with Show / Start-Pause /
  Skip / Reset / Quit, and clicking the dock icon brings the window back.
- All settings persist to disk.

## Architecture

```
pomodoro-app/
├── index.html            # app shell (tabbed views)
├── dev/                  # dev-only UI preview harness (not shipped)
├── vite.config.js
├── src/
│   ├── main.js           # UI logic, rendering, theming, shortcuts
│   └── style.css         # glassmorphism + theme tokens
└── src-tauri/            # Rust backend
    ├── tauri.conf.json
    ├── capabilities/
    └── src/
        ├── main.rs       # entry point
        ├── lib.rs        # commands, background ticker, tray
        ├── timer.rs      # timer state machine
        └── store.rs      # todos, goals, settings, daily history
```

### How it works

- `timer.rs` holds the state machine (`Work` / `ShortBreak` / `LongBreak`), remaining time
  and cycle count.
- `lib.rs` owns an `AppState` protected by a single `Mutex`. A background thread ticks every
  second, emits a `state` event to the frontend, and fires a notification when a phase ends.
- Commands (`toggle`, `add_todo`, `add_goal`, `set_theme`, …) are exposed to the frontend
  via `invoke`. Struct-typed arguments use serde's snake_case field names.
- `store.rs` persists todos, goals, settings, and per-day stats to `pomodoro-data.json` in
  the macOS app data directory.

## Getting started

Requirements: [Node.js](https://nodejs.org), the [Rust toolchain](https://rustup.rs),
and macOS build tools (`xcode-select --install`).

```bash
npm install
npm run dev      # launch the app in development
npm run build    # produce a distributable .app bundle
```

Useful Tauri CLI commands:

```bash
npx tauri dev
npx tauri build
npx tauri icon path/to/source.png   # regenerate icons
```

### UI preview without the Rust backend

`dev/mock.html` renders the real UI against a mocked backend, which is handy for
iterating on styles without rebuilding the Rust side:

```bash
npm run preview
# → http://localhost:5174/dev/mock.html
```

The preview file is generated from `index.html` on every build, so it can never
drift out of sync. It accepts query parameters for previewing different states:

```
?tab=timer|todos|goals|stats   &modal=settings
&theme=glass-dark|glass-light|aurora|solid-dark
&accent=coral|violet|mint|sky|amber|pink
&opacity=0..100               &key=space|s|r|n|1|2|3|4
```

## Publishing

### Open source (ready now)

This project is MIT licensed and set up for public contribution: `LICENSE`,
`CONTRIBUTING.md`, a GitHub Actions workflow that tests and builds on macOS,
Windows and Linux, and a clean git history on `main`.

To publish it:

```bash
git remote add origin git@github.com:<you>/pomodoro.git
git push -u origin main
```

### Mac App Store

Possible, with some caveats. You need an Apple Developer Program membership
($99/year) and Tauri v2's App Store support.

- The app must be **sandboxed** and signed with a distribution certificate;
  `tauri.conf.json` needs an `entitlements` file and the `bundle.macOS`
  section configured for App Store distribution.
- Signing and notarisation are driven by `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID` and
  `APPLE_PASSWORD` environment variables.
- **The menu bar tray must be disabled for the App Store build.** Apple rejects
  agent-style (menu bar only) apps, so the tray should be behind a Cargo
  feature that is off for App Store builds.
- Storing data in the app container (as this app does) is sandbox-safe.

### Google Play Store

Also possible — Tauri v2 targets Android from the same source tree.

- Requires the Google Play Console ($25 one-off), the Android SDK/NDK and
  JDK 17, then `npx tauri android init`.
- Rust targets needed: `aarch64-linux-android`,
  `armv7-linux-androideabi`, `x86_64-linux-android`.
- Build with `npx tauri android build --apk` for testing and
  `--aab` for the Play Console upload. 64-bit is required, and Play needs a
  privacy policy and a data-safety declaration.
- The code here is already mobile-ready: the menu bar tray is compiled out on
  mobile (`#[cfg(desktop)]`), and notifications work on Android.

### iOS App Store

Tauri v2 supports iOS from a Mac with Xcode installed:

```bash
npx tauri ios init
npx tauri ios build
```

## License

Released under the [MIT License](LICENSE). Use it, fork it, ship it — just keep
the copyright notice.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, project layout, and
the conventions for adding features.

### Building for Android

The same source tree builds for Android. On macOS:

```bash
# 1. Toolchain: JDK 17, Android SDK (platform 37, build-tools 36, NDK 27)
#    and the Rust Android targets.
rustup target add aarch64-linux-android armv7-linux-androideabi \
                 i686-linux-android x86_64-linux-android

# 2. Generate the Gradle project (once)
npx tauri android init --ci

# 3. Build
npx tauri android build --apk      # debug APK
npx tauri android build --aab      # bundle for the Play Console
```

The APKs are written to `src-tauri/gen/android/app/build/outputs/apk/`.

`ANDROID_HOME`, `ANDROID_SDK_ROOT`, `NDK_HOME` and `JAVA_HOME` must point at
your SDK/JDK installations.

### Signing

A release signing key lives outside the repository, so the credentials are
never committed:

```
~/tools/android-build/keystore/pomodoro-release.jks
~/tools/android-build/keystore/credentials.txt
```

`src-tauri/gen/android/key.properties` points Gradle at that keystore, and is
listed in the Android project's `.gitignore`.

> **Back these two files up somewhere safe.** The Play Console requires the
> *same* upload key for every update you publish — if you lose it you must ask
> Google to reset it, and existing installs will not accept the new build
> until they are updated by hand.

To build a Play-ready bundle:

```bash
npx tauri android build --aab
```

The `.aab` is written to `src-tauri/gen/android/app/build/outputs/bundle/`.

### Installing on a device

```bash
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk
```

Debug builds use the `.debug` application id suffix, so they can be
installed alongside a release build.

### What differs on Android

| | Desktop | Android |
| --- | --- | --- |
| Menu bar tray | yes | compiled out (`#[cfg(desktop)]`) |
| Dock / dock click | yes | n/a |
| System notifications | yes | yes, via the notification plugin |
| Keyboard shortcuts | yes | n/a (no hardware keyboard assumed) |
| Data storage | app data dir | app data dir (sandboxed) |

The layout is the same single-column design, tuned for a phone-sized viewport.

## macOS notes

- **Code signing** — `tauri.conf.json` sets `signingIdentity: "-"` (ad-hoc). The app runs
  fine, but Gatekeeper may warn on first launch; right-click → Open to bypass. Set a real
  Developer ID to distribute properly.
- **DMG creation** — building the `.dmg` runs a Finder AppleScript and therefore needs a
  graphical session. In a headless/CI environment use `npx tauri build --bundles app`.

## Tests

```bash
cd src-tauri && cargo test
```

The Rust suite covers the timer state machine, todo/goal mutations, settings persistence,
and the JSON wire format shared with the frontend.
