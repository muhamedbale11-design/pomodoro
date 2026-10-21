# Contributing

Thanks for your interest in improving Pomodoro! This is a small project, so
simple, focused pull requests are easiest to review.

## Getting set up

```bash
npm install
npm run dev
```

Requirements: Node.js 18+, the Rust toolchain (https://rustup.rs), and on
macOS the command line tools (`xcode-select --install`).

## Before opening a pull request

```bash
cd src-tauri && cargo test   # Rust unit tests
npm run build                 # frontend + app build
```

Please keep the Rust code warning-free (`cargo clippy` is a good check) and
format both sides:

```bash
cd src-tauri && cargo fmt
npx prettier --write src index.html
```

## Project layout

| Path | What lives there |
| --- | --- |
| `src/main.js` | UI logic, rendering, theming, keyboard shortcuts |
| `src/style.css` | Theme tokens and all styling |
| `index.html` | App shell |
| `src-tauri/src/timer.rs` | Timer state machine |
| `src-tauri/src/store.rs` | Todos, goals, settings, daily history |
| `src-tauri/src/lib.rs` | Commands, background ticker, menu bar tray |
| `dev/` | Dev-only UI preview harness (not shipped) |

## Adding a feature

- **Frontend → backend:** add a `#[tauri::command]` in `src-tauri/src/lib.rs`,
  register it in `invoke_handler!`, and call it from `src/main.js`.
- **Persisted data:** add the field to the relevant struct in `store.rs` and
  give it a `#[serde(default)]` so existing data files still load.
- **Wire format:** command arguments that are structs are deserialised by
  serde, so their fields use **snake_case** in both Rust and JavaScript. Only
  top-level scalar arguments use camelCase (`todoId`, `subtaskId`, `dueDate`).
  `store.rs` has tests that lock this in.

## Previewing UI changes

```bash
npm run preview
```

This serves the real UI against a mocked backend at
<http://localhost:5174/dev/mock.html>, which is much faster than rebuilding
the Rust side. Useful query parameters:

```
?tab=timer|todos|goals|stats   &modal=settings
&theme=glass-dark|glass-light|aurora|solid-dark
&accent=coral|violet|mint|sky|amber|pink
&opacity=0..100               &key=space|s|r|n|1|2|3|4
```

## Reporting bugs

Open an issue with your OS and app version, what you did, what you expected,
and what happened instead. A screenshot helps a lot.
