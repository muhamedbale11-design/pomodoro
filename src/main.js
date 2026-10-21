import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Element references
// ---------------------------------------------------------------------------
const els = {
  body: document.body,
  phaseLabel: $("phaseLabel"),
  ringProgress: $("ringProgress"),
  timeDisplay: $("timeDisplay"),
  statusDisplay: $("statusDisplay"),
  dots: $("dots"),
  toggleBtn: $("toggleBtn"),
  resetBtn: $("resetBtn"),
  skipBtn: $("skipBtn"),
  focusChip: $("focusChip"),
  focusTaskName: $("focusTaskName"),
  focusTaskCount: $("focusTaskCount"),
  dailyGoalFill: $("dailyGoalFill"),
  dailyGoalHint: $("dailyGoalHint"),

  tabs: $("tabs"),
  todoForm: $("todoForm"),
  todoTitle: $("todoTitle"),
  todoPriority: $("todoPriority"),
  todoDue: $("todoDue"),
  todoNotes: $("todoNotes"),
  todoFormMore: $("todoFormMore"),
  todoFormExtra: $("todoFormExtra"),
  todoFilters: $("todoFilters"),
  todoList: $("todoList"),

  dailyTargetFill: $("dailyTargetFill"),
  dailyTargetHint: $("dailyTargetHint"),
  dailyGoalInput: $("dailyGoalInput"),
  goalForm: $("goalForm"),
  goalTitle: $("goalTitle"),
  goalKind: $("goalKind"),
  goalScope: $("goalScope"),
  goalTarget: $("goalTarget"),
  goalDeadline: $("goalDeadline"),
  goalList: $("goalList"),

  statPomodoros: $("statPomodoros"),
  statFocus: $("statFocus"),
  statTasks: $("statTasks"),
  allPomodoros: $("allPomodoros"),
  allFocus: $("allFocus"),
  allTasks: $("allTasks"),
  dateLabel: $("dateLabel"),
  weekChart: $("weekChart"),

  settingsToggle: $("settingsToggle"),
  settingsModal: $("settingsModal"),
  settingsClose: $("settingsClose"),
  saveSettings: $("saveSettings"),
  themeGrid: $("themeGrid"),
  accentSwatches: $("accentSwatches"),
  blurRange: $("blurRange"),
  blurValue: $("blurValue"),
  opacityRange: $("opacityRange"),
  opacityValue: $("opacityValue"),
  glassEnabled: $("glassEnabled"),
  workMinutes: $("workMinutes"),
  shortBreakMinutes: $("shortBreakMinutes"),
  longBreakMinutes: $("longBreakMinutes"),
  longBreakInterval: $("longBreakInterval"),
  autoAdvance: $("autoAdvance"),
  soundEnabled: $("soundEnabled"),
};

const CIRCUMFERENCE = 628.318;

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------
const THEMES = [
  { id: "glass-dark", name: "Glass Dark", preview: "linear-gradient(135deg,#232a38,#0a0c11)" },
  { id: "glass-light", name: "Glass Light", preview: "linear-gradient(135deg,#ffffff,#dbe3f0)" },
  { id: "aurora", name: "Aurora", preview: "linear-gradient(135deg,#7a2cff,#ff2f7d)" },
  { id: "solid-dark", name: "Solid Dark", preview: "linear-gradient(135deg,#232833,#11141a)" },
];

const ACCENTS = [
  { id: "coral", hex: "#ff6b57" },
  { id: "violet", hex: "#a78bfa" },
  { id: "mint", hex: "#4cc38a" },
  { id: "sky", hex: "#56b4f7" },
  { id: "amber", hex: "#f5b544" },
  { id: "pink", hex: "#ff5fa2" },
];

/**
 * Natural panel opacity per theme (0-100). Used as the starting point when
 * switching themes; a value the user has tuned is preserved.
 */
const THEME_OPACITY = {
  "glass-dark": 6,
  "glass-light": 42,
  aurora: 7,
  "solid-dark": 100,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = null;
let prevPhase = null;
let audioCtx = null;
let activeTab = "timer";
let todoFilter = "all";
let expandedTodo = null;
let lastTodoSig = null;
let lastGoalSig = null;
let appliedThemeSig = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDuration(totalSeconds) {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function phaseTitle(phase) {
  if (phase === "Work") return "Focus";
  if (phase === "LongBreak") return "Long break";
  return "Short break";
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Theme application
// ---------------------------------------------------------------------------
function applyTheme(prefs) {
  const body = els.body;
  for (const theme of THEMES) {
    body.classList.toggle(`theme-${theme.id}`, theme.id === prefs.theme);
  }
  body.classList.toggle("no-glass", !prefs.glass_enabled);

  const accent = ACCENTS.find((a) => a.id === prefs.accent) || ACCENTS[0];
  body.style.setProperty("--accent", accent.hex);
  body.style.setProperty("--accent-soft", hexToRgba(accent.hex, 0.18));
  body.style.setProperty("--blur", `${prefs.blur}px`);

  // Panel opacity is user controlled (0 = invisible, 100 = opaque).
  const opacity = prefs.theme === "solid-dark" ? 100 : (prefs.opacity ?? 6);
  body.style.setProperty("--panel-alpha", String(opacity / 100));
}

function buildThemeControls(prefs) {
  els.themeGrid.innerHTML = "";
  for (const theme of THEMES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "theme-card" + (theme.id === prefs.theme ? " is-active" : "");
    card.dataset.theme = theme.id;

    const preview = document.createElement("div");
    preview.className = "theme-card__preview";
    preview.style.background = theme.preview;

    const name = document.createElement("div");
    name.className = "theme-card__name";
    name.textContent = theme.name;

    card.append(preview, name);
    card.addEventListener("click", () => switchTheme(theme.id));
    els.themeGrid.appendChild(card);
  }

  els.accentSwatches.innerHTML = "";
  for (const accent of ACCENTS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch" + (accent.id === prefs.accent ? " is-active" : "");
    swatch.style.background = accent.hex;
    swatch.style.color = accent.hex;
    swatch.title = accent.id;
    swatch.addEventListener("click", () => saveTheme({ ...prefs, accent: accent.id }));
    els.accentSwatches.appendChild(swatch);
  }

  els.blurRange.value = prefs.blur;
  els.blurValue.textContent = `${prefs.blur}px`;
  els.glassEnabled.checked = prefs.glass_enabled;

  els.opacityRange.value = prefs.opacity ?? 6;
  els.opacityValue.textContent = `${els.opacityRange.value}%`;
  // The solid theme is opaque by definition, so the control is not useful.
  els.opacityRange.disabled = prefs.theme === "solid-dark";
}

async function saveTheme(next) {
  applyTheme(next);
  buildThemeControls(next);
  await invoke("set_theme", {
    theme: {
      theme: next.theme,
      accent: next.accent,
      blur: next.blur,
      glass_enabled: next.glass_enabled,
      opacity: next.opacity,
    },
  });
}

/**
 * Switch themes. If the user has not tuned the panel opacity, adopt the new
 * theme's natural opacity; otherwise keep their value.
 */
function switchTheme(themeId) {
  const current = state.theme;
  const untouched = current.opacity === THEME_OPACITY[current.theme];
  const opacity = untouched ? (THEME_OPACITY[themeId] ?? current.opacity) : current.opacity;
  saveTheme({ ...current, theme: themeId, opacity });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render(next) {
  state = next;

  // Only re-apply the theme when it actually changes, so that dragging the
  // blur slider isn't interrupted by the once-per-second tick.
  const themeSig = JSON.stringify(state.theme);
  if (themeSig !== appliedThemeSig) {
    appliedThemeSig = themeSig;
    applyTheme(state.theme);
  }

  renderTimer();
  renderTodos();
  renderGoals();
  renderStats();

  if (prevPhase && prevPhase !== state.phase && state.config.sound_enabled) {
    playChime(state.phase);
  }
  prevPhase = state.phase;
}

function renderTimer() {
  const isWork = state.phase === "Work";
  els.phaseLabel.textContent = phaseTitle(state.phase);
  els.phaseLabel.className = `phase ${isWork ? "phase--work" : "phase--break"}`;
  els.ringProgress.style.stroke = isWork ? "var(--accent)" : "var(--break)";

  els.timeDisplay.textContent = formatTime(state.remaining_secs);
  document.title = `${formatTime(state.remaining_secs)} · ${phaseTitle(state.phase)}`;

  const progress = state.total_secs > 0 ? state.remaining_secs / state.total_secs : 0;
  els.ringProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  els.statusDisplay.textContent = state.running ? "Running" : "Paused";
  els.toggleBtn.textContent = state.running
    ? "Pause"
    : state.remaining_secs === state.total_secs
      ? "Start"
      : "Resume";

  // Session dots
  const interval = Math.max(1, state.config.long_break_interval);
  els.dots.innerHTML = "";
  for (let i = 0; i < interval; i++) {
    const dot = document.createElement("div");
    dot.className = "dot" + (i < state.cycle_count ? " dot--done" : "");
    els.dots.appendChild(dot);
  }

  // Focused task chip
  const active = state.todos.find((t) => t.active);
  els.focusTaskName.textContent = active ? active.title : "Nothing selected";
  els.focusTaskCount.textContent = active ? `${active.pomodoros} 🍅` : "—";

  // Daily goal
  const target = Math.max(1, state.daily_goal);
  els.dailyGoalFill.style.width = `${Math.min(100, (state.stats.pomodoros / target) * 100)}%`;
  els.dailyGoalHint.textContent = `${state.stats.pomodoros} / ${state.daily_goal}`;
}

// ---------------------------------------------------------------------------
// To-do list
// ---------------------------------------------------------------------------
function visibleTodos() {
  const todos = state.todos;
  if (todoFilter === "done") return todos.filter((t) => t.done);
  if (todoFilter === "active") return todos.filter((t) => !t.done);
  return todos;
}

function dueBadge(todo) {
  if (!todo.due_date) return null;
  const today = todayIso();
  if (todo.due_date < today) {
    return { cls: "badge--overdue", text: "Overdue" };
  }
  if (todo.due_date === today) {
    return { cls: "badge--due-soon", text: "Due today" };
  }
  const diff = Math.round((new Date(todo.due_date) - new Date(today)) / 86400000);
  if (diff <= 3) {
    return { cls: "badge--due-soon", text: `Due in ${diff}d` };
  }
  return { cls: "", text: todo.due_date };
}

function renderTodos() {
  const sig = JSON.stringify(state.todos);
  if (sig === lastTodoSig) return;
  lastTodoSig = sig;

  els.todoList.innerHTML = "";
  const todos = visibleTodos();

  if (todos.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent =
      todoFilter === "all"
        ? "No tasks yet — add one above."
        : `No ${todoFilter} tasks.`;
    els.todoList.appendChild(li);
    return;
  }

  for (const todo of todos) {
    els.todoList.appendChild(buildTodoItem(todo));
  }
}

function buildTodoItem(todo) {
  const li = document.createElement("li");
  li.className =
    "todo glass" + (todo.active ? " todo--active" : "") + (todo.done ? " todo--done" : "");

  const row = document.createElement("div");
  row.className = "todo__row";

  // Checkbox
  const check = document.createElement("button");
  check.type = "button";
  check.className = "todo__check";
  check.textContent = todo.done ? "✓" : "";
  check.title = todo.done ? "Mark as not done" : "Mark as done";
  check.addEventListener("click", () => invoke("toggle_todo", { id: todo.id }));
  row.appendChild(check);

  // Body
  const body = document.createElement("div");
  body.className = "todo__body";

  const title = document.createElement("div");
  title.className = "todo__title";
  title.textContent = todo.title;
  body.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "todo__meta";

  if (todo.active) {
    const b = document.createElement("span");
    b.className = "badge badge--active";
    b.textContent = "In progress";
    meta.appendChild(b);
  }
  if (todo.priority && todo.priority !== "none") {
    const b = document.createElement("span");
    b.className = `badge badge--${todo.priority}`;
    b.textContent = todo.priority;
    meta.appendChild(b);
  }
  const due = dueBadge(todo);
  if (due) {
    const b = document.createElement("span");
    b.className = `badge ${due.cls}`;
    b.textContent = due.text;
    meta.appendChild(b);
  }
  if (todo.pomodoros > 0) {
    const b = document.createElement("span");
    b.className = "badge badge--pomo";
    b.textContent = `${todo.pomodoros} 🍅`;
    meta.appendChild(b);
  }
  if (todo.subtasks.length > 0) {
    const done = todo.subtasks.filter((s) => s.done).length;
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = `${done}/${todo.subtasks.length} steps`;
    meta.appendChild(b);
  }
  if (meta.childElementCount > 0) body.appendChild(meta);
  row.appendChild(body);

  // Actions
  const actions = document.createElement("div");
  actions.className = "todo__actions";

  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "mini-btn";
  expand.textContent = expandedTodo === todo.id ? "▲" : "▼";
  expand.title = "Details";
  expand.addEventListener("click", () => {
    expandedTodo = expandedTodo === todo.id ? null : todo.id;
    lastTodoSig = null;
    renderTodos();
  });
  actions.appendChild(expand);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "mini-btn mini-btn--danger";
  remove.textContent = "✕";
  remove.title = "Delete";
  remove.addEventListener("click", () => invoke("remove_todo", { id: todo.id }));
  actions.appendChild(remove);

  row.appendChild(actions);
  li.appendChild(row);

  if (expandedTodo === todo.id) {
    li.appendChild(buildTodoDetail(todo));
  }
  return li;
}

function buildTodoDetail(todo) {
  const detail = document.createElement("div");
  detail.className = "todo__detail";

  // Editable title
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = todo.title;
  titleInput.placeholder = "Task title";
  const saveTitle = () => {
    const value = titleInput.value.trim();
    if (value && value !== todo.title) invoke("rename_todo", { id: todo.id, title: value });
  };
  titleInput.addEventListener("blur", saveTitle);
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") titleInput.blur();
  });
  detail.appendChild(titleInput);

  // Priority + due date
  const row = document.createElement("div");
  row.className = "field-row";

  const priority = document.createElement("label");
  priority.className = "mini-field";
  priority.innerHTML = "<span>Priority</span>";
  const prioritySelect = document.createElement("select");
  for (const value of ["none", "low", "medium", "high"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value[0].toUpperCase() + value.slice(1);
    prioritySelect.appendChild(option);
  }
  prioritySelect.value = todo.priority || "none";
  prioritySelect.addEventListener("change", () =>
    invoke("set_todo_priority", { id: todo.id, priority: prioritySelect.value })
  );
  priority.appendChild(prioritySelect);
  row.appendChild(priority);

  const due = document.createElement("label");
  due.className = "mini-field";
  due.innerHTML = "<span>Due date</span>";
  const dueInput = document.createElement("input");
  dueInput.type = "date";
  dueInput.value = todo.due_date || "";
  dueInput.addEventListener("change", () =>
    invoke("set_todo_due", { id: todo.id, dueDate: dueInput.value || null })
  );
  due.appendChild(dueInput);
  row.appendChild(due);

  detail.appendChild(row);

  // Notes
  const notes = document.createElement("input");
  notes.type = "text";
  notes.value = todo.notes || "";
  notes.placeholder = "Notes";
  notes.addEventListener("change", () =>
    invoke("set_todo_notes", { id: todo.id, notes: notes.value.trim() || null })
  );
  detail.appendChild(notes);

  // Subtasks
  const list = document.createElement("ul");
  list.className = "subtasks";
  for (const sub of todo.subtasks) {
    const item = document.createElement("li");
    item.className = "subtask" + (sub.done ? " subtask--done" : "");

    const check = document.createElement("button");
    check.type = "button";
    check.className = "subtask__check";
    check.textContent = sub.done ? "✓" : "";
    check.addEventListener("click", () =>
      invoke("toggle_subtask", { todoId: todo.id, subtaskId: sub.id })
    );
    item.appendChild(check);

    const label = document.createElement("span");
    label.className = "subtask__title";
    label.textContent = sub.title;
    item.appendChild(label);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "mini-btn mini-btn--danger";
    del.textContent = "✕";
    del.addEventListener("click", () =>
      invoke("remove_subtask", { todoId: todo.id, subtaskId: sub.id })
    );
    item.appendChild(del);

    list.appendChild(item);
  }
  detail.appendChild(list);

  const subForm = document.createElement("form");
  subForm.className = "subtask-form";
  const subInput = document.createElement("input");
  subInput.type = "text";
  subInput.placeholder = "Add a step…";
  subInput.autocomplete = "off";
  const subBtn = document.createElement("button");
  subBtn.type = "submit";
  subBtn.className = "btn btn--small";
  subBtn.textContent = "Add";
  subForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = subInput.value.trim();
    if (!value) return;
    invoke("add_subtask", { todoId: todo.id, title: value });
    subInput.value = "";
  });
  subForm.append(subInput, subBtn);
  detail.appendChild(subForm);

  // Focus this task
  if (!todo.active) {
    const focusBtn = document.createElement("button");
    focusBtn.type = "button";
    focusBtn.className = "btn btn--small btn--full";
    focusBtn.textContent = "Focus this task";
    focusBtn.addEventListener("click", () => invoke("set_active_todo", { id: todo.id }));
    detail.appendChild(focusBtn);
  }

  return detail;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
function goalProgress(goal) {
  const source = goal.scope === "daily" ? state.stats : state.all_time;
  let current;
  if (goal.kind === "pomodoros") {
    current = source.pomodoros;
  } else {
    current = Math.round((source.focus_seconds / 3600) * 10) / 10;
  }
  const target = Math.max(1, goal.target);
  return { current, target, pct: Math.min(100, (current / target) * 100) };
}

function renderGoals() {
  // The daily target tracks today's progress, so it updates on every tick.
  const dailyTarget = Math.max(1, state.daily_goal);
  els.dailyTargetFill.style.width = `${Math.min(100, (state.stats.pomodoros / dailyTarget) * 100)}%`;
  els.dailyTargetHint.textContent = `${state.stats.pomodoros} / ${state.daily_goal} pomodoros`;
  if (document.activeElement !== els.dailyGoalInput) {
    els.dailyGoalInput.value = state.daily_goal;
  }

  const sig = JSON.stringify(state.goals);
  if (sig === lastGoalSig) return;
  lastGoalSig = sig;

  els.goalList.innerHTML = "";
  if (state.goals.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No goals yet — create one to track progress.";
    els.goalList.appendChild(li);
    return;
  }

  for (const goal of state.goals) {
    const { current, target, pct } = goalProgress(goal);

    const li = document.createElement("li");
    li.className = "goal glass";

    const head = document.createElement("div");
    head.className = "goal__head";

    const title = document.createElement("div");
    title.className = "goal__title";
    title.textContent = goal.title;
    head.appendChild(title);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mini-btn mini-btn--danger";
    remove.textContent = "✕";
    remove.title = "Delete goal";
    remove.addEventListener("click", () => invoke("remove_goal", { id: goal.id }));
    head.appendChild(remove);

    const bar = document.createElement("div");
    bar.className = "progress";
    const fill = document.createElement("div");
    fill.className = "progress__fill";
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    const meta = document.createElement("div");
    meta.className = "goal__meta";

    const kindBadge = document.createElement("span");
    kindBadge.className = "badge";
    kindBadge.textContent = goal.kind === "pomodoros" ? "Pomodoros" : "Focus hours";
    meta.appendChild(kindBadge);

    const scopeBadge = document.createElement("span");
    scopeBadge.className = "badge";
    scopeBadge.textContent = goal.scope === "daily" ? "Daily" : "All time";
    meta.appendChild(scopeBadge);

    if (goal.deadline) {
      const deadline = document.createElement("span");
      deadline.className = "badge";
      deadline.textContent = `By ${goal.deadline}`;
      meta.appendChild(deadline);
    }

    if (current >= target) {
      const achieved = document.createElement("span");
      achieved.className = "badge badge--done";
      achieved.textContent = "Achieved";
      meta.appendChild(achieved);
    }

    const count = document.createElement("div");
    count.className = "goal__count";
    const progressText =
      goal.kind === "pomodoros"
        ? `${current} / ${target} pomodoros`
        : `${current} / ${target} hours`;
    count.textContent = `${progressText} · ${Math.round(pct)}%`;

    li.append(head, bar, meta, count);
    els.goalList.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function renderStats() {
  const stats = state.stats;
  els.statPomodoros.textContent = stats.pomodoros;
  els.statFocus.textContent = formatDuration(stats.focus_seconds);
  els.statTasks.textContent = stats.tasks_done;
  els.dateLabel.textContent = stats.date || "";

  const all = state.all_time;
  els.allPomodoros.textContent = all.pomodoros;
  els.allFocus.textContent = formatDuration(all.focus_seconds);
  els.allTasks.textContent = all.tasks_done;

  // 7 day chart
  const week = state.week || [];
  const max = Math.max(1, ...week.map((d) => d.pomodoros));
  els.weekChart.innerHTML = "";
  for (const day of week) {
    const col = document.createElement("div");
    col.className = "chart__col";

    const value = document.createElement("div");
    value.className = "chart__value";
    value.textContent = day.pomodoros;

    const bar = document.createElement("div");
    bar.className = "chart__bar";
    bar.style.height = `${Math.max(3, (day.pomodoros / max) * 74)}px`;
    bar.title = `${day.date}: ${day.pomodoros} pomodoros`;

    const label = document.createElement("div");
    label.className = "chart__label";
    const parsed = new Date(`${day.date}T00:00:00`);
    label.textContent = isNaN(parsed)
      ? "--"
      : parsed.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);

    col.append(value, bar, label);
    els.weekChart.appendChild(col);
  }
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------
function playChime(phase) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx = audioCtx || new AudioContext();

    // Work ended -> bright rising chime. Break ended -> softer descending tone.
    const notes = phase === "Work" ? [660, 880] : [520, 392];
    const now = audioCtx.currentTime;
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch (err) {
    console.warn("Could not play sound", err);
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function switchTab(name) {
  activeTab = name;
  for (const tab of els.tabs.querySelectorAll(".tab")) {
    tab.classList.toggle("is-active", tab.dataset.tab === name);
  }
  for (const view of document.querySelectorAll(".view")) {
    const on = view.dataset.view === name;
    view.hidden = !on;
    view.classList.toggle("is-active", on);
  }
}

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------
function openSettings() {
  if (state) {
    buildThemeControls(state.theme);
    els.workMinutes.value = state.config.work_minutes;
    els.shortBreakMinutes.value = state.config.short_break_minutes;
    els.longBreakMinutes.value = state.config.long_break_minutes;
    els.longBreakInterval.value = state.config.long_break_interval;
    els.autoAdvance.checked = state.config.auto_advance;
    els.soundEnabled.checked = state.config.sound_enabled;
  }
  els.settingsModal.hidden = false;
  els.workMinutes.focus();
}

function closeSettings() {
  els.settingsModal.hidden = true;
}

async function saveSettings() {
  // `config` is a struct-typed argument, so serde expects the Rust field
  // names (snake_case) — the same names the state snapshot uses.
  const config = {
    work_minutes: clampInt(els.workMinutes.value, 1, 180, 25),
    short_break_minutes: clampInt(els.shortBreakMinutes.value, 1, 60, 5),
    long_break_minutes: clampInt(els.longBreakMinutes.value, 1, 90, 15),
    long_break_interval: clampInt(els.longBreakInterval.value, 1, 12, 4),
    auto_advance: els.autoAdvance.checked,
    sound_enabled: els.soundEnabled.checked,
  };
  await invoke("set_config", { config });
  closeSettings();
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
function setupEvents() {
  // Timer
  els.toggleBtn.addEventListener("click", () => invoke("toggle"));
  els.resetBtn.addEventListener("click", () => invoke("reset"));
  els.skipBtn.addEventListener("click", () => invoke("skip"));

  // Tabs
  els.tabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) switchTab(tab.dataset.tab);
  });

  // To-do
  els.todoForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = els.todoTitle.value.trim();
    if (!title) return;
    invoke("add_todo", {
      title,
      priority: els.todoPriority.value,
      dueDate: els.todoDue.value || null,
      notes: els.todoNotes.value.trim() || null,
    });
    els.todoTitle.value = "";
    els.todoDue.value = "";
    els.todoNotes.value = "";
    els.todoTitle.focus();
  });

  els.todoFormMore.addEventListener("click", () => {
    const open = els.todoFormExtra.hidden;
    els.todoFormExtra.hidden = !open;
    els.todoFormMore.setAttribute("aria-expanded", String(open));
  });

  els.todoFilters.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    todoFilter = chip.dataset.filter;
    for (const c of els.todoFilters.querySelectorAll(".chip")) {
      c.classList.toggle("is-active", c === chip);
    }
    lastTodoSig = null;
    renderTodos();
  });

  // Goals
  els.goalForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = els.goalTitle.value.trim();
    if (!title) return;
    invoke("add_goal", {
      title,
      kind: els.goalKind.value,
      scope: els.goalScope.value,
      target: clampInt(els.goalTarget.value, 1, 9999, 10),
      deadline: els.goalDeadline.value || null,
    });
    els.goalTitle.value = "";
    els.goalDeadline.value = "";
    els.goalTitle.focus();
  });

  els.dailyGoalInput.addEventListener("change", () =>
    invoke("set_daily_goal", { target: clampInt(els.dailyGoalInput.value, 1, 50, 5) })
  );

  // Settings
  els.settingsToggle.addEventListener("click", openSettings);
  els.settingsClose.addEventListener("click", closeSettings);
  els.saveSettings.addEventListener("click", saveSettings);

  // Clicking the "working on" chip jumps to the to-do list.
  els.focusChip.addEventListener("click", () => switchTab("todos"));
  els.settingsModal.addEventListener("click", (e) => {
    if (e.target === els.settingsModal) closeSettings();
  });

  els.blurRange.addEventListener("input", () => {
    els.blurValue.textContent = `${els.blurRange.value}px`;
    if (state) {
      const prefs = { ...state.theme, blur: parseInt(els.blurRange.value, 10) };
      applyTheme(prefs);
    }
  });
  els.blurRange.addEventListener("change", () => {
    if (state) saveTheme({ ...state.theme, blur: parseInt(els.blurRange.value, 10) });
  });

  els.opacityRange.addEventListener("input", () => {
    els.opacityValue.textContent = `${els.opacityRange.value}%`;
    if (state) {
      applyTheme({ ...state.theme, opacity: parseInt(els.opacityRange.value, 10) });
    }
  });
  els.opacityRange.addEventListener("change", () => {
    if (state) saveTheme({ ...state.theme, opacity: parseInt(els.opacityRange.value, 10) });
  });

  els.glassEnabled.addEventListener("change", () => {
    if (state) saveTheme({ ...state.theme, glass_enabled: els.glassEnabled.checked });
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", onKeyDown);
}

function onKeyDown(e) {
  if (e.key === "Escape") {
    if (!els.settingsModal.hidden) {
      closeSettings();
      e.preventDefault();
    }
    return;
  }

  const el = document.activeElement;
  const typing =
    el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable);
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key) {
    case " ":
      e.preventDefault();
      invoke("toggle");
      break;
    case "s":
    case "S":
      invoke("skip");
      break;
    case "r":
    case "R":
      invoke("reset");
      break;
    case "n":
    case "N":
      switchTab("todos");
      els.todoTitle.focus();
      break;
    case "1":
      switchTab("timer");
      break;
    case "2":
      switchTab("todos");
      break;
    case "3":
      switchTab("goals");
      break;
    case "4":
      switchTab("stats");
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function init() {
  setupEvents();

  if (!window.__TAURI_INTERNALS__) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div style="position:fixed;top:0;left:0;right:0;background:#7a1f16;color:#fff;padding:10px 16px;font-size:13px;text-align:center;z-index:99">
         Running outside Tauri — the timer engine is unavailable. Use <code>npm run dev</code>.
       </div>`
    );
    return;
  }

  render(await invoke("get_state"));
  await listen("state", (event) => render(event.payload));
}

init().catch((err) => console.error("Failed to start app", err));
