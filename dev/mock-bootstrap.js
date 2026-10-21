import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";

// ---------------------------------------------------------------------------
// A fake backend so the real UI can be rendered (and screenshotted) in a
// plain browser. Dev-only: never bundled into the shipped app.
// ---------------------------------------------------------------------------

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const inDays = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return iso(d);
};

const POMS = [3, 5, 2, 6, 4, 7, 3];
const week = [];
for (let i = 6; i >= 0; i--) {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  week.push({
    date: iso(d),
    pomodoros: POMS[6 - i],
    focus_seconds: POMS[6 - i] * 1500,
    tasks_done: 2,
  });
}

const state = {
  phase: "Work",
  remaining_secs: 1372,
  total_secs: 1500,
  running: true,
  cycle_count: 2,
  config: {
    work_minutes: 25,
    short_break_minutes: 5,
    long_break_minutes: 15,
    long_break_interval: 4,
    auto_advance: true,
    sound_enabled: true,
  },
  theme: { theme: "glass-dark", accent: "coral", blur: 18, glass_enabled: true, opacity: 6 },
  daily_goal: 5,
  todos: [
    {
      id: 0,
      title: "Finish the glassmorphism UI",
      done: false,
      priority: "high",
      due_date: iso(today),
      notes: "Polish the blur, then check the light theme.",
      subtasks: [
        { id: 0, title: "Design tokens", done: true },
        { id: 1, title: "Wire up the theme picker", done: false },
      ],
      pomodoros: 3,
      active: true,
      created_at: iso(today),
      completed_at: null,
    },
    {
      id: 1,
      title: "Write the release notes",
      done: false,
      priority: "medium",
      due_date: inDays(2),
      notes: null,
      subtasks: [],
      pomodoros: 1,
      active: false,
      created_at: iso(today),
      completed_at: null,
    },
    {
      id: 2,
      title: "Review open pull requests",
      done: true,
      priority: "low",
      due_date: null,
      notes: null,
      subtasks: [],
      pomodoros: 2,
      active: false,
      created_at: iso(today),
      completed_at: iso(today),
    },
  ],
  goals: [
    {
      id: 0,
      title: "Ship v1.0 of the app",
      kind: "pomodoros",
      scope: "all_time",
      target: 100,
      deadline: inDays(30),
      created_at: iso(today),
    },
    {
      id: 1,
      title: "Deep work hours",
      kind: "focus_hours",
      scope: "all_time",
      target: 20,
      deadline: null,
      created_at: iso(today),
    },
    {
      id: 2,
      title: "Pomodoros per day",
      kind: "pomodoros",
      scope: "daily",
      target: 5,
      deadline: null,
      created_at: iso(today),
    },
  ],
  stats: { date: iso(today), pomodoros: 3, focus_seconds: 4500, tasks_done: 1 },
  all_time: { pomodoros: 128, focus_seconds: 192000, tasks_done: 54 },
  week,
};

// --- surface any JS error in the DOM so headless runs can detect it --------
const consoleErrors = [];
for (const level of ["error", "warn"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    consoleErrors.push(`${level}: ${args.map((a) => String(a)).join(" ")}`);
    original(...args);
  };
}

window.addEventListener("error", (e) => {
  document.body.setAttribute("data-js-error", e.message || "unknown");
  const banner = document.createElement("div");
  banner.textContent = `JS ERROR: ${e.message}`;
  banner.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;background:#b3261e;color:#fff;padding:8px;font-size:12px;z-index:999";
  document.body.appendChild(banner);
});
window.addEventListener("unhandledrejection", (e) => {
  document.body.setAttribute("data-js-error", String(e.reason));
});

mockWindows("main");

let getStateCalls = 0;

mockIPC(
  async (cmd, args) => {
    switch (cmd) {
      case "get_state":
        getStateCalls += 1;
        return state;

      case "toggle":
        state.running = !state.running;
        break;
      case "reset":
        state.remaining_secs = state.total_secs;
        state.running = false;
        break;
      case "skip":
        state.phase = state.phase === "Work" ? "ShortBreak" : "Work";
        state.total_secs = state.phase === "Work" ? 1500 : 300;
        state.remaining_secs = state.total_secs;
        break;

      case "set_config":
        Object.assign(state.config, args.config);
        break;
      case "set_theme":
        Object.assign(state.theme, args.theme);
        break;      case "set_daily_goal":
        state.daily_goal = args.target;
        break;

      case "add_todo": {
        const todo = {
          id: state.todos.length,
          title: args.title,
          done: false,
          priority: args.priority || "none",
          due_date: args.dueDate || null,
          notes: args.notes || null,
          subtasks: [],
          pomodoros: 0,
          active: true,
          created_at: iso(today),
          completed_at: null,
        };
        state.todos.forEach((t) => (t.active = false));
        state.todos.push(todo);
        break;
      }
      case "rename_todo": {
        const t = state.todos.find((t) => t.id === args.id);
        if (t) t.title = args.title;
        break;
      }
      case "set_todo_priority": {
        const t = state.todos.find((t) => t.id === args.id);
        if (t) t.priority = args.priority;
        break;
      }
      case "set_todo_due": {
        const t = state.todos.find((t) => t.id === args.id);
        if (t) t.due_date = args.dueDate;
        break;
      }
      case "set_todo_notes": {
        const t = state.todos.find((t) => t.id === args.id);
        if (t) t.notes = args.notes;
        break;
      }
      case "toggle_todo": {
        const t = state.todos.find((t) => t.id === args.id);
        if (t) {
          t.done = !t.done;
          state.stats.tasks_done += t.done ? 1 : -1;
        }
        break;
      }
      case "set_active_todo":
        state.todos.forEach((t) => (t.active = t.id === args.id));
        break;
      case "remove_todo":
        state.todos = state.todos.filter((t) => t.id !== args.id);
        break;

      case "add_subtask": {
        const t = state.todos.find((t) => t.id === args.todoId);
        if (t) t.subtasks.push({ id: t.subtasks.length, title: args.title, done: false });
        break;
      }
      case "toggle_subtask": {
        const t = state.todos.find((t) => t.id === args.todoId);
        const s = t && t.subtasks.find((s) => s.id === args.subtaskId);
        if (s) s.done = !s.done;
        break;
      }
      case "remove_subtask": {
        const t = state.todos.find((t) => t.id === args.todoId);
        if (t) t.subtasks = t.subtasks.filter((s) => s.id !== args.subtaskId);
        break;
      }

      case "add_goal":
        state.goals.push({
          id: state.goals.length,
          title: args.title,
          kind: args.kind,
          scope: args.scope,
          target: args.target,
          deadline: args.deadline || null,
          created_at: iso(today),
        });
        break;
      case "remove_goal":
        state.goals = state.goals.filter((g) => g.id !== args.id);
        break;

      default:
        return null;
    }

    emit("state", state);
    return null;
  },
  { shouldMockEvents: true }
);

// --- allow driving the UI from the URL for screenshots --------------------
const params = new URLSearchParams(location.search);

// Dispatch a synthetic keydown so shortcuts can be verified headlessly.
function pressKey(key) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
}

setTimeout(() => {
  const tab = params.get("tab");
  if (tab) document.querySelector(`.tab[data-tab="${tab}"]`)?.click();
  if (params.get("modal") === "settings") {
    document.getElementById("settingsToggle")?.click();
  }
  if (params.get("theme")) {
    state.theme.theme = params.get("theme");
    emit("state", state);
  }
  if (params.get("accent")) {
    state.theme.accent = params.get("accent");
    emit("state", state);
  }
  if (params.get("opacity")) {
    state.theme.opacity = Number(params.get("opacity"));
    emit("state", state);
  }
  if (params.get("expand")) {
    const id = Number(params.get("expand"));
    const todo = state.todos.find((t) => t.id === id);
    if (todo) {
      const rows = document.querySelectorAll(".todo__actions .mini-btn");
      const index = [...document.querySelectorAll(".todo")].findIndex((li) =>
        li.textContent.includes(todo.title),
      );
      rows[index * 2]?.click();
    }
  }
  if (params.get("key")) {
    pressKey(params.get("key"));
  }
  if (params.get("action") === "close-settings") {
    document.getElementById("settingsClose")?.click();
  }
  if (params.get("action") === "focus-chip") {
    document.getElementById("focusChip")?.click();
  }
  document.body.setAttribute("data-ready", "1");
}, 400);

// --- keyboard shortcut verification ---------------------------------------
setTimeout(() => {
  const activeTab = document.querySelector(".tab.is-active")?.dataset.tab;
  const focused = document.activeElement?.id;
  const settingsHidden = document.getElementById("settingsModal")?.hidden;
  document.body.setAttribute(
    "data-keys-debug",
    JSON.stringify({
      activeTab,
      focused,
      settingsHidden,
      getStateCalls,
      consoleErrors,
      running: state.running,
      phase: state.phase,
      remaining: state.remaining_secs,
      todos: state.todos.length,
    })
  );
}, 1100);

// --- layout diagnostics (used by the headless screenshot harness) ---------
// Headless Chrome never advances CSS transitions, which would freeze theme
// colours mid-transition in screenshots. Disable them for preview purposes.
const stillStyle = document.createElement("style");
stillStyle.textContent =
  "*, *::before, *::after { transition: none !important; }";
document.head.appendChild(stillStyle);

setTimeout(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), width: Math.round(r.width), right: Math.round(r.right) };
  };
  document.body.setAttribute(
    "data-layout",
    JSON.stringify({
      innerWidth: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      app: rect(".app"),
      topbar: rect(".topbar"),
      ring: rect(".ring"),
      chip: rect(".focus-chip"),
    })
  );

  const cs = getComputedStyle(document.body);
  document.body.setAttribute(
    "data-theme-debug",
    JSON.stringify({
      classes: document.body.className,
      themeParam: new URLSearchParams(location.search).get("theme"),
      bg: cs.backgroundColor,
      bgVar: cs.getPropertyValue("--bg").trim(),
      color: cs.color,
      textVar: cs.getPropertyValue("--text").trim(),
      panel: getComputedStyle(document.querySelector(".topbar")).backgroundColor,
      accent: cs.getPropertyValue("--accent").trim(),
      blur: cs.getPropertyValue("--blur").trim(),
    })
  );
}, 1200);
