use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use chrono::{Duration, Local};
use serde::{Deserialize, Serialize};

use crate::timer::Config;

// ---------------------------------------------------------------------------
// To-do list
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    #[default]
    None,
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subtask {
    pub id: u64,
    pub title: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Todo {
    pub id: u64,
    pub title: String,
    pub done: bool,
    pub priority: Priority,
    pub due_date: Option<String>,
    pub notes: Option<String>,
    pub subtasks: Vec<Subtask>,
    /// Focus sessions completed while this was the active task.
    pub pomodoros: u64,
    /// The task currently being worked on.
    pub active: bool,
    pub created_at: String,
    pub completed_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GoalKind {
    Pomodoros,
    FocusHours,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GoalScope {
    AllTime,
    Daily,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    pub id: u64,
    pub title: String,
    pub kind: GoalKind,
    pub scope: GoalScope,
    pub target: u64,
    pub deadline: Option<String>,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Settings (timer + theme + daily target)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ThemePrefs {
    pub theme: String,
    pub accent: String,
    pub blur: u8,
    pub glass_enabled: bool,
    /// Opacity of the frosted panels, 0 (invisible) to 100 (opaque).
    pub opacity: u8,
}

impl Default for ThemePrefs {
    fn default() -> Self {
        Self {
            theme: "glass-dark".into(),
            accent: "coral".into(),
            blur: 18,
            glass_enabled: true,
            opacity: 6,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub config: Config,
    pub theme: ThemePrefs,
    pub daily_goal_pomodoros: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            config: Config::default(),
            theme: ThemePrefs::default(),
            daily_goal_pomodoros: 5,
        }
    }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub pomodoros: u64,
    pub focus_seconds: u64,
    pub tasks_done: u64,
}

/// Cumulative totals across every recorded day.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Totals {
    pub pomodoros: u64,
    pub focus_seconds: u64,
    pub tasks_done: u64,
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Store {
    pub todos: Vec<Todo>,
    pub goals: Vec<Goal>,
    pub next_todo_id: u64,
    pub next_subtask_id: u64,
    pub next_goal_id: u64,
    pub history: BTreeMap<String, DailyStats>,
    pub settings: AppSettings,
}

impl Store {
    pub fn today_key() -> String {
        Local::now().format("%Y-%m-%d").to_string()
    }

    fn stats_mut(&mut self) -> &mut DailyStats {
        let key = Self::today_key();
        self.history
            .entry(key.clone())
            .or_insert_with(|| DailyStats {
                date: key,
                ..Default::default()
            })
    }

    pub fn today_stats(&self) -> DailyStats {
        self.history
            .get(&Self::today_key())
            .cloned()
            .unwrap_or_else(|| DailyStats {
                date: Self::today_key(),
                ..Default::default()
            })
    }

    pub fn all_time(&self) -> Totals {
        let mut totals = Totals::default();
        for day in self.history.values() {
            totals.pomodoros += day.pomodoros;
            totals.focus_seconds += day.focus_seconds;
            totals.tasks_done += day.tasks_done;
        }
        totals
    }

    /// The last 7 days, oldest first, with empty entries for missing days.
    pub fn last_7_days(&self) -> Vec<DailyStats> {
        let today = Local::now().date_naive();
        (0..7)
            .rev()
            .map(|offset| {
                let day = today - Duration::days(offset as i64);
                let key = day.format("%Y-%m-%d").to_string();
                self.history.get(&key).cloned().unwrap_or(DailyStats {
                    date: key,
                    ..Default::default()
                })
            })
            .collect()
    }

    // ---- To-do -----------------------------------------------------------

    pub fn add_todo(
        &mut self,
        title: String,
        priority: Priority,
        due_date: Option<String>,
        notes: Option<String>,
    ) -> Todo {
        // A newly added task becomes the current focus.
        for task in &mut self.todos {
            task.active = false;
        }
        let id = self.next_todo_id;
        self.next_todo_id += 1;
        let todo = Todo {
            id,
            title,
            done: false,
            priority,
            due_date,
            notes,
            subtasks: Vec::new(),
            pomodoros: 0,
            active: true,
            created_at: Self::today_key(),
            completed_at: None,
        };
        self.todos.push(todo.clone());
        todo
    }

    fn update_todo<F: FnOnce(&mut Todo)>(&mut self, id: u64, change: F) {
        if let Some(task) = self.todos.iter_mut().find(|t| t.id == id) {
            change(task);
        }
    }

    pub fn rename_todo(&mut self, id: u64, title: String) {
        self.update_todo(id, |t| t.title = title);
    }

    pub fn set_priority(&mut self, id: u64, priority: Priority) {
        self.update_todo(id, |t| t.priority = priority);
    }

    pub fn set_due_date(&mut self, id: u64, due_date: Option<String>) {
        self.update_todo(id, |t| t.due_date = due_date);
    }

    pub fn set_notes(&mut self, id: u64, notes: Option<String>) {
        self.update_todo(id, |t| t.notes = notes);
    }

    pub fn toggle_todo(&mut self, id: u64) {
        let today = Self::today_key();
        let done = match self.todos.iter_mut().find(|t| t.id == id) {
            Some(task) => {
                task.done = !task.done;
                task.completed_at = if task.done { Some(today) } else { None };
                task.done
            }
            None => return,
        };
        let stats = self.stats_mut();
        if done {
            stats.tasks_done += 1;
        } else {
            stats.tasks_done = stats.tasks_done.saturating_sub(1);
        }
    }

    pub fn set_active_todo(&mut self, id: u64) {
        for task in &mut self.todos {
            task.active = task.id == id;
        }
    }

    pub fn remove_todo(&mut self, id: u64) {
        self.todos.retain(|t| t.id != id);
    }

    pub fn add_subtask(&mut self, todo_id: u64, title: String) {
        let id = self.next_subtask_id;
        self.next_subtask_id += 1;
        if let Some(task) = self.todos.iter_mut().find(|t| t.id == todo_id) {
            task.subtasks.push(Subtask {
                id,
                title,
                done: false,
            });
        }
    }

    pub fn toggle_subtask(&mut self, todo_id: u64, subtask_id: u64) {
        if let Some(task) = self.todos.iter_mut().find(|t| t.id == todo_id) {
            if let Some(sub) = task.subtasks.iter_mut().find(|s| s.id == subtask_id) {
                sub.done = !sub.done;
            }
        }
    }

    pub fn remove_subtask(&mut self, todo_id: u64, subtask_id: u64) {
        if let Some(task) = self.todos.iter_mut().find(|t| t.id == todo_id) {
            task.subtasks.retain(|s| s.id != subtask_id);
        }
    }

    // ---- Goals -----------------------------------------------------------

    pub fn add_goal(
        &mut self,
        title: String,
        kind: GoalKind,
        scope: GoalScope,
        target: u64,
        deadline: Option<String>,
    ) -> Goal {
        let id = self.next_goal_id;
        self.next_goal_id += 1;
        let goal = Goal {
            id,
            title,
            kind,
            scope,
            target,
            deadline,
            created_at: Self::today_key(),
        };
        self.goals.push(goal.clone());
        goal
    }

    pub fn remove_goal(&mut self, id: u64) {
        self.goals.retain(|g| g.id != id);
    }

    // ---- Stats -----------------------------------------------------------

    /// Record a completed focus session against today and the active task.
    pub fn record_pomodoro(&mut self, focus_seconds: u64) {
        {
            let stats = self.stats_mut();
            stats.pomodoros += 1;
            stats.focus_seconds += focus_seconds;
        }
        if let Some(task) = self.todos.iter_mut().find(|t| t.active) {
            task.pomodoros += 1;
        }
    }

    // ---- Persistence -----------------------------------------------------

    pub fn load(path: &Path) -> Store {
        match fs::read_to_string(path) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
            Err(_) => Store::default(),
        }
    }

    pub fn save(&self, path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(text) = serde_json::to_string_pretty(self) {
            let _ = fs::write(path, text);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// A unique temp path per call. `line!()` is not usable here: it expands
    /// at the macro's own source line, so every caller would share one path
    /// and the tests would race on the same file.
    fn tmp_path() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let mut p = std::env::temp_dir();
        p.push(format!("pomodoro-test-{}-{}.json", std::process::id(), n));
        p
    }

    #[test]
    fn add_todo_assigns_ids_and_activates_newest() {
        let mut s = Store::default();
        let a = s.add_todo("First".into(), Priority::None, None, None);
        let b = s.add_todo(
            "Second".into(),
            Priority::High,
            Some("2026-12-31".into()),
            None,
        );
        assert_eq!(a.id, 0);
        assert_eq!(b.id, 1);
        assert_eq!(s.todos.len(), 2);
        assert!(!s.todos[0].active);
        assert!(s.todos[1].active);
        assert_eq!(s.todos[1].priority, Priority::High);
        assert_eq!(s.todos[1].due_date.as_deref(), Some("2026-12-31"));
    }

    #[test]
    fn record_pomodoro_updates_active_todo_and_today() {
        let mut s = Store::default();
        s.add_todo("Write tests".into(), Priority::None, None, None);
        s.record_pomodoro(1500);
        s.record_pomodoro(1500);
        let stats = s.today_stats();
        assert_eq!(stats.pomodoros, 2);
        assert_eq!(stats.focus_seconds, 3000);
        assert_eq!(s.todos[0].pomodoros, 2);
    }

    #[test]
    fn all_time_sums_history() {
        let mut s = Store::default();
        s.record_pomodoro(600);
        let totals = s.all_time();
        assert_eq!(totals.pomodoros, 1);
        assert_eq!(totals.focus_seconds, 600);
    }

    #[test]
    fn toggle_todo_tracks_done_count_and_completion_date() {
        let mut s = Store::default();
        s.add_todo("Task".into(), Priority::None, None, None);
        s.toggle_todo(0);
        assert!(s.todos[0].done);
        assert_eq!(s.today_stats().tasks_done, 1);
        assert!(s.todos[0].completed_at.is_some());
        s.toggle_todo(0);
        assert!(!s.todos[0].done);
        assert_eq!(s.today_stats().tasks_done, 0);
        assert!(s.todos[0].completed_at.is_none());
    }

    #[test]
    fn todo_edits_update_fields() {
        let mut s = Store::default();
        s.add_todo("Original".into(), Priority::None, None, None);
        s.rename_todo(0, "Renamed".into());
        s.set_priority(0, Priority::Medium);
        s.set_due_date(0, Some("2026-11-01".into()));
        s.set_notes(0, Some("remember the milk".into()));
        let t = &s.todos[0];
        assert_eq!(t.title, "Renamed");
        assert_eq!(t.priority, Priority::Medium);
        assert_eq!(t.due_date.as_deref(), Some("2026-11-01"));
        assert_eq!(t.notes.as_deref(), Some("remember the milk"));
    }

    #[test]
    fn subtasks_can_be_added_toggled_and_removed() {
        let mut s = Store::default();
        s.add_todo("Parent".into(), Priority::None, None, None);
        s.add_subtask(0, "Child".into());
        assert_eq!(s.todos[0].subtasks.len(), 1);
        let sub_id = s.todos[0].subtasks[0].id;

        s.toggle_subtask(0, sub_id);
        assert!(s.todos[0].subtasks[0].done);

        s.remove_subtask(0, sub_id);
        assert!(s.todos[0].subtasks.is_empty());
    }

    #[test]
    fn set_active_todo_selects_one() {
        let mut s = Store::default();
        s.add_todo("A".into(), Priority::None, None, None);
        s.add_todo("B".into(), Priority::None, None, None);
        s.set_active_todo(0);
        assert!(s.todos[0].active);
        assert!(!s.todos[1].active);
    }

    #[test]
    fn goals_add_and_remove() {
        let mut s = Store::default();
        let g = s.add_goal(
            "Ship the app".into(),
            GoalKind::FocusHours,
            GoalScope::AllTime,
            20,
            None,
        );
        assert_eq!(g.id, 0);
        assert_eq!(s.goals.len(), 1);
        s.remove_goal(0);
        assert!(s.goals.is_empty());
    }

    #[test]
    fn last_7_days_returns_seven_entries_oldest_first() {
        let s = Store::default();
        let week = s.last_7_days();
        assert_eq!(week.len(), 7);
        assert!(week[0].date < week[6].date);
    }

    #[test]
    fn save_and_load_roundtrip() {
        let path = tmp_path();
        let mut s = Store::default();
        s.add_todo(
            "Persisted".into(),
            Priority::High,
            None,
            Some("note".into()),
        );
        s.add_goal(
            "Goal".into(),
            GoalKind::Pomodoros,
            GoalScope::Daily,
            5,
            None,
        );
        s.record_pomodoro(600);
        s.save(&path);

        let loaded = Store::load(&path);
        assert_eq!(loaded.todos.len(), 1);
        assert_eq!(loaded.todos[0].title, "Persisted");
        assert_eq!(loaded.todos[0].priority, Priority::High);
        assert_eq!(loaded.todos[0].notes.as_deref(), Some("note"));
        assert_eq!(loaded.goals.len(), 1);
        assert_eq!(loaded.goals[0].title, "Goal");
        assert_eq!(loaded.next_todo_id, 1);
        assert_eq!(loaded.today_stats().pomodoros, 1);
        assert_eq!(loaded.today_stats().focus_seconds, 600);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn load_missing_file_returns_default() {
        let loaded = Store::load(&std::env::temp_dir().join("definitely-missing-pomodoro.json"));
        assert!(loaded.todos.is_empty());
        assert_eq!(loaded.next_todo_id, 0);
    }

    #[test]
    fn settings_default_to_glass_theme() {
        let s = Store::default();
        assert_eq!(s.settings.theme.theme, "glass-dark");
        assert_eq!(s.settings.theme.accent, "coral");
        assert!(s.settings.theme.glass_enabled);
        assert_eq!(s.settings.daily_goal_pomodoros, 5);
    }

    #[test]
    fn settings_persist_across_reload() {
        let path = tmp_path();
        let mut s = Store::default();
        s.settings.config.work_minutes = 45;
        s.settings.config.sound_enabled = false;
        s.settings.theme.theme = "aurora".into();
        s.settings.theme.accent = "violet".into();
        s.settings.theme.blur = 30;
        s.settings.theme.glass_enabled = false;
        s.settings.daily_goal_pomodoros = 8;
        s.save(&path);

        let loaded = Store::load(&path);
        assert_eq!(loaded.settings.config.work_minutes, 45);
        assert!(!loaded.settings.config.sound_enabled);
        assert_eq!(loaded.settings.theme.theme, "aurora");
        assert_eq!(loaded.settings.theme.accent, "violet");
        assert_eq!(loaded.settings.theme.blur, 30);
        assert!(!loaded.settings.theme.glass_enabled);
        assert_eq!(loaded.settings.daily_goal_pomodoros, 8);
        let _ = fs::remove_file(&path);
    }

    // ---- Wire format ----------------------------------------------------
    // These lock in the exact JSON the frontend sends/receives. Struct-typed
    // command arguments are deserialised by serde, so the field names must be
    // snake_case and match what src/main.js sends.

    #[test]
    fn theme_prefs_round_trip_through_serde() {
        let json = serde_json::json!({
            "theme": "aurora",
            "accent": "violet",
            "blur": 24,
            "glass_enabled": false,
            "opacity": 33
        });
        let prefs: ThemePrefs = serde_json::from_value(json).unwrap();
        assert_eq!(prefs.theme, "aurora");
        assert_eq!(prefs.accent, "violet");
        assert_eq!(prefs.blur, 24);
        assert!(!prefs.glass_enabled);
        assert_eq!(prefs.opacity, 33);

        let back = serde_json::to_value(&prefs).unwrap();
        assert_eq!(back["theme"], "aurora");
        assert_eq!(back["glass_enabled"], serde_json::json!(false));
        assert_eq!(back["opacity"], serde_json::json!(33));
    }

    #[test]
    fn theme_prefs_default_opacity_is_translucent() {
        let prefs = ThemePrefs::default();
        assert_eq!(prefs.opacity, 6);
        assert!(
            prefs.opacity < 100,
            "glass should not be fully opaque by default"
        );
    }

    #[test]
    fn priority_accepts_lowercase_strings() {
        assert_eq!(
            serde_json::from_value::<Priority>(serde_json::json!("high")).unwrap(),
            Priority::High
        );
        assert_eq!(
            serde_json::from_value::<Priority>(serde_json::json!("none")).unwrap(),
            Priority::None
        );
    }

    #[test]
    fn goal_kind_and_scope_accept_snake_case_strings() {
        assert_eq!(
            serde_json::from_value::<GoalKind>(serde_json::json!("focus_hours")).unwrap(),
            GoalKind::FocusHours
        );
        assert_eq!(
            serde_json::from_value::<GoalScope>(serde_json::json!("all_time")).unwrap(),
            GoalScope::AllTime
        );
        assert_eq!(
            serde_json::from_value::<GoalScope>(serde_json::json!("daily")).unwrap(),
            GoalScope::Daily
        );
    }

    #[test]
    fn todo_serialises_with_expected_keys() {
        let mut s = Store::default();
        s.add_todo(
            "Wire".into(),
            Priority::Medium,
            Some("2026-10-30".into()),
            None,
        );
        let value = serde_json::to_value(&s.todos[0]).unwrap();
        for key in [
            "id",
            "title",
            "done",
            "priority",
            "due_date",
            "notes",
            "subtasks",
            "pomodoros",
            "active",
        ] {
            assert!(value.get(key).is_some(), "missing key: {key}");
        }
        assert_eq!(value["priority"], serde_json::json!("medium"));
    }
}
