mod store;
mod timer;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::TrayIconBuilder;

use store::{
    DailyStats, Goal, GoalKind, GoalScope, Priority, Store, ThemePrefs, Todo, Totals,
};
use timer::{Config, Phase, Timer};

/// Shared, mutable application state. Guarded by a single mutex so the tick
/// thread and command handlers can never deadlock.
pub struct AppState {
    inner: Mutex<AppInner>,
    data_path: PathBuf,
}

struct AppInner {
    timer: Timer,
    store: Store,
}

/// Serializable snapshot pushed to the frontend on every tick.
#[derive(Clone, serde::Serialize)]
struct StateSnapshot {
    phase: Phase,
    remaining_secs: u64,
    total_secs: u64,
    running: bool,
    cycle_count: u64,
    config: Config,
    theme: ThemePrefs,
    daily_goal: u64,
    todos: Vec<Todo>,
    goals: Vec<Goal>,
    stats: DailyStats,
    all_time: Totals,
    week: Vec<DailyStats>,
}

fn build_snapshot(inner: &AppInner) -> StateSnapshot {
    let store = &inner.store;
    StateSnapshot {
        phase: inner.timer.phase,
        remaining_secs: inner.timer.remaining_secs,
        total_secs: inner.timer.total_secs,
        running: inner.timer.running,
        cycle_count: inner.timer.cycle_count,
        config: inner.timer.config.clone(),
        theme: store.settings.theme.clone(),
        daily_goal: store.settings.daily_goal_pomodoros,
        todos: store.todos.clone(),
        goals: store.goals.clone(),
        stats: store.today_stats(),
        all_time: store.all_time(),
        week: store.last_7_days(),
    }
}

/// Lock state, mutate it, persist the store, then broadcast the new snapshot.
fn mutate(app: &AppHandle, state: &AppState, change: impl FnOnce(&mut AppInner)) {
    let mut inner = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    change(&mut inner);
    inner.store.save(&state.data_path);
    let snapshot = build_snapshot(&inner);
    drop(inner);
    let _ = app.emit("state", snapshot);
}

// ---------------------------------------------------------------------------
// Timer commands
// ---------------------------------------------------------------------------

fn do_toggle(app: &AppHandle, state: &AppState) {
    mutate(app, state, |inner| inner.timer.toggle());
}

fn do_reset(app: &AppHandle, state: &AppState) {
    mutate(app, state, |inner| inner.timer.reset());
}

fn do_skip(app: &AppHandle, state: &AppState) {
    mutate(app, state, |inner| inner.timer.skip());
}

#[tauri::command]
fn get_state(state: State<AppState>) -> StateSnapshot {
    let inner = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    build_snapshot(&inner)
}

#[tauri::command]
fn toggle(app: AppHandle, state: State<AppState>) {
    do_toggle(&app, &state);
}

#[tauri::command]
fn reset(app: AppHandle, state: State<AppState>) {
    do_reset(&app, &state);
}

#[tauri::command]
fn skip(app: AppHandle, state: State<AppState>) {
    do_skip(&app, &state);
}

#[tauri::command]
fn set_config(app: AppHandle, state: State<AppState>, config: Config) {
    mutate(&app, &state, |inner| {
        // Persist the new timings too, so they survive a restart.
        inner.store.settings.config = config.clone();
        inner.timer.apply_config(config);
    });
}

#[tauri::command]
fn set_theme(app: AppHandle, state: State<AppState>, theme: ThemePrefs) {
    mutate(&app, &state, |inner| {
        let mut theme = theme;
        // Keep the values within sane bounds.
        theme.opacity = theme.opacity.min(100);
        theme.blur = theme.blur.min(60);
        inner.store.settings.theme = theme;
    });
}

#[tauri::command]
fn set_daily_goal(app: AppHandle, state: State<AppState>, target: u64) {
    mutate(&app, &state, |inner| {
        inner.store.settings.daily_goal_pomodoros = target;
    });
}

// ---------------------------------------------------------------------------
// To-do commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn add_todo(
    app: AppHandle,
    state: State<AppState>,
    title: String,
    priority: Priority,
    due_date: Option<String>,
    notes: Option<String>,
) {
    mutate(&app, &state, |inner| {
        inner.store.add_todo(title, priority, due_date, notes);
    });
}

#[tauri::command]
fn rename_todo(app: AppHandle, state: State<AppState>, id: u64, title: String) {
    mutate(&app, &state, |inner| inner.store.rename_todo(id, title));
}

#[tauri::command]
fn set_todo_priority(app: AppHandle, state: State<AppState>, id: u64, priority: Priority) {
    mutate(&app, &state, |inner| inner.store.set_priority(id, priority));
}

#[tauri::command]
fn set_todo_due(app: AppHandle, state: State<AppState>, id: u64, due_date: Option<String>) {
    mutate(&app, &state, |inner| inner.store.set_due_date(id, due_date));
}

#[tauri::command]
fn set_todo_notes(app: AppHandle, state: State<AppState>, id: u64, notes: Option<String>) {
    mutate(&app, &state, |inner| inner.store.set_notes(id, notes));
}

#[tauri::command]
fn toggle_todo(app: AppHandle, state: State<AppState>, id: u64) {
    mutate(&app, &state, |inner| inner.store.toggle_todo(id));
}

#[tauri::command]
fn set_active_todo(app: AppHandle, state: State<AppState>, id: u64) {
    mutate(&app, &state, |inner| inner.store.set_active_todo(id));
}

#[tauri::command]
fn remove_todo(app: AppHandle, state: State<AppState>, id: u64) {
    mutate(&app, &state, |inner| inner.store.remove_todo(id));
}

#[tauri::command]
fn add_subtask(app: AppHandle, state: State<AppState>, todo_id: u64, title: String) {
    mutate(&app, &state, |inner| inner.store.add_subtask(todo_id, title));
}

#[tauri::command]
fn toggle_subtask(app: AppHandle, state: State<AppState>, todo_id: u64, subtask_id: u64) {
    mutate(&app, &state, |inner| inner.store.toggle_subtask(todo_id, subtask_id));
}

#[tauri::command]
fn remove_subtask(app: AppHandle, state: State<AppState>, todo_id: u64, subtask_id: u64) {
    mutate(&app, &state, |inner| inner.store.remove_subtask(todo_id, subtask_id));
}

// ---------------------------------------------------------------------------
// Goal commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn add_goal(
    app: AppHandle,
    state: State<AppState>,
    title: String,
    kind: GoalKind,
    scope: GoalScope,
    target: u64,
    deadline: Option<String>,
) {
    mutate(&app, &state, |inner| {
        inner.store.add_goal(title, kind, scope, target, deadline);
    });
}

#[tauri::command]
fn remove_goal(app: AppHandle, state: State<AppState>, id: u64) {
    mutate(&app, &state, |inner| inner.store.remove_goal(id));
}

// ---------------------------------------------------------------------------
// Background ticker
// ---------------------------------------------------------------------------

fn notify(app: &AppHandle, finished: Phase) {
    let (title, body) = match finished {
        Phase::Work => (
            "Focus session complete",
            "Nice work — time for a well-earned break.",
        ),
        Phase::ShortBreak => ("Break over", "Ready for another focus session?"),
        Phase::LongBreak => ("Long break over", "Time to get back to it."),
    };
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

/// Android 13 (API 33) introduced a runtime permission for notifications.
/// Without it, `show()` silently does nothing.
#[cfg(target_os = "android")]
fn request_notification_permission(app: &AppHandle) {
    use tauri_plugin_notification::PermissionState;

    if let Ok(state) = app.notification().permission_state() {
        if matches!(
            state,
            PermissionState::Prompt | PermissionState::PromptWithRationale
        ) {
            let _ = app.notification().request_permission();
        }
    }
}

fn spawn_ticker(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let state = app.state::<AppState>();

        // Tick, and if a phase finished, record it and persist immediately.
        let finished = {
            let mut inner = state.inner.lock().unwrap_or_else(|e| e.into_inner());
            let finished = inner.timer.tick();
            if let Some(phase) = finished {
                if phase.is_work() {
                    let focus_secs = inner.timer.config.work_minutes * 60;
                    inner.store.record_pomodoro(focus_secs);
                }
                inner.store.save(&state.data_path);
            }
            finished
        };

        if let Some(phase) = finished {
            notify(&app, phase);
        }

        // Only push updates when something actually changed: while running, or
        // right after a phase finished (even if auto-advance left it paused).
        let running = {
            let inner = state.inner.lock().unwrap_or_else(|e| e.into_inner());
            inner.timer.running
        };
        if running || finished.is_some() {
            let snapshot = {
                let inner = state.inner.lock().unwrap_or_else(|e| e.into_inner());
                build_snapshot(&inner)
            };
            let _ = app.emit("state", snapshot);
        }
    });
}

// ---------------------------------------------------------------------------
// Tray / menu bar
// ---------------------------------------------------------------------------

#[cfg(desktop)]
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Pomodoro", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Start / Pause", true, None::<&str>)?;
    let skip = MenuItem::with_id(app, "skip", "Skip Phase", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "Reset Phase", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &toggle, &skip, &reset, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .unwrap_or_else(|| panic!("window icon missing"));

    TrayIconBuilder::with_id("pomodoro-tray")
        .tooltip("Pomodoro")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let state = app.state::<AppState>();
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "toggle" => do_toggle(app, &state),
                "skip" => do_skip(app, &state),
                "reset" => do_reset(app, &state),
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let data_path = data_dir.join("pomodoro-data.json");
            let store = Store::load(&data_path);
            // Persist immediately so the file always reflects the current
            // schema, even if the user never changes anything.
            store.save(&data_path);
            let timer = Timer::new(store.settings.config.clone());

            app.manage(AppState {
                inner: Mutex::new(AppInner { timer, store }),
                data_path,
            });

            spawn_ticker(app.handle().clone());
            #[cfg(desktop)]
            build_tray(app.handle())?;
            #[cfg(target_os = "android")]
            request_notification_permission(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            toggle,
            reset,
            skip,
            set_config,
            set_theme,
            set_daily_goal,
            add_todo,
            rename_todo,
            set_todo_priority,
            set_todo_due,
            set_todo_notes,
            toggle_todo,
            set_active_todo,
            remove_todo,
            add_subtask,
            toggle_subtask,
            remove_subtask,
            add_goal,
            remove_goal,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Show the window again when the macOS dock icon is clicked.
    app.run(|handle, event| on_run_event(handle, event));
}

/// macOS delivers `Reopen` when the dock icon is clicked; other platforms
/// have no equivalent event, so this is a no-op there.
#[cfg(target_os = "macos")]
fn on_run_event(handle: &AppHandle, event: tauri::RunEvent) {
    if let tauri::RunEvent::Reopen {
        has_visible_windows, ..
    } = event
    {
        if !has_visible_windows {
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn on_run_event(_handle: &AppHandle, _event: tauri::RunEvent) {}
