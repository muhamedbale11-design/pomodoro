use serde::{Deserialize, Serialize};

/// The three phases of a Pomodoro cycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum Phase {
    Work,
    ShortBreak,
    LongBreak,
}

impl Phase {
    pub fn is_work(&self) -> bool {
        matches!(self, Phase::Work)
    }
}

/// User-configurable timings and behaviour.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub work_minutes: u64,
    pub short_break_minutes: u64,
    pub long_break_minutes: u64,
    pub long_break_interval: u64,
    pub auto_advance: bool,
    pub sound_enabled: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            work_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            long_break_interval: 4,
            auto_advance: true,
            sound_enabled: true,
        }
    }
}

/// The timer state machine. All durations are stored in seconds.
#[derive(Debug, Clone)]
pub struct Timer {
    pub phase: Phase,
    pub remaining_secs: u64,
    pub total_secs: u64,
    pub running: bool,
    /// Completed work sessions in the current cycle (drives the long break).
    pub cycle_count: u64,
    pub config: Config,
}

impl Timer {
    pub fn new(config: Config) -> Self {
        let total = Self::duration_for(&config, Phase::Work);
        Self {
            phase: Phase::Work,
            remaining_secs: total,
            total_secs: total,
            running: false,
            cycle_count: 0,
            config,
        }
    }

    fn duration_for(config: &Config, phase: Phase) -> u64 {
        let minutes = match phase {
            Phase::Work => config.work_minutes,
            Phase::ShortBreak => config.short_break_minutes,
            Phase::LongBreak => config.long_break_minutes,
        };
        minutes * 60
    }

    pub fn toggle(&mut self) {
        self.running = !self.running;
    }

    /// Restart the current phase from the beginning.
    pub fn reset(&mut self) {
        self.total_secs = Self::duration_for(&self.config, self.phase);
        self.remaining_secs = self.total_secs;
        self.running = false;
    }

    /// Advance to the next phase after a completion.
    /// Returns the phase that just finished.
    pub fn advance(&mut self) -> Phase {
        let finished = self.phase;
        match finished {
            Phase::Work => {
                self.cycle_count += 1;
                self.phase = if self.cycle_count % self.config.long_break_interval == 0 {
                    Phase::LongBreak
                } else {
                    Phase::ShortBreak
                };
            }
            Phase::ShortBreak => {
                self.phase = Phase::Work;
            }
            Phase::LongBreak => {
                // A full cycle is done — start a fresh one.
                self.cycle_count = 0;
                self.phase = Phase::Work;
            }
        }
        self.total_secs = Self::duration_for(&self.config, self.phase);
        self.remaining_secs = self.total_secs;
        self.running = self.config.auto_advance;
        finished
    }

    /// Jump to the next phase without recording a completed session.
    pub fn skip(&mut self) {
        self.phase = match self.phase {
            Phase::Work => Phase::ShortBreak,
            Phase::ShortBreak | Phase::LongBreak => Phase::Work,
        };
        self.total_secs = Self::duration_for(&self.config, self.phase);
        self.remaining_secs = self.total_secs;
        self.running = false;
    }

    /// Decrement one second. Returns `Some(phase)` when the phase ends.
    pub fn tick(&mut self) -> Option<Phase> {
        if !self.running {
            return None;
        }
        if self.remaining_secs > 0 {
            self.remaining_secs -= 1;
        }
        if self.remaining_secs == 0 {
            Some(self.advance())
        } else {
            None
        }
    }

    /// Apply new settings. If the current phase hasn't started, resize it too.
    pub fn apply_config(&mut self, config: Config) {
        let at_start = !self.running && self.remaining_secs == self.total_secs;
        self.config = config;
        if at_start {
            self.total_secs = Self::duration_for(&self.config, self.phase);
            self.remaining_secs = self.total_secs;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(work: u64, short: u64, long: u64, interval: u64, auto: bool) -> Config {
        Config {
            work_minutes: work,
            short_break_minutes: short,
            long_break_minutes: long,
            long_break_interval: interval,
            auto_advance: auto,
            sound_enabled: true,
        }
    }

    #[test]
    fn starts_at_work_not_running() {
        let t = Timer::new(cfg(25, 5, 15, 4, true));
        assert_eq!(t.phase, Phase::Work);
        assert_eq!(t.total_secs, 25 * 60);
        assert_eq!(t.remaining_secs, 25 * 60);
        assert!(!t.running);
        assert_eq!(t.cycle_count, 0);
    }

    #[test]
    fn tick_does_nothing_when_paused() {
        let mut t = Timer::new(cfg(25, 5, 15, 4, false));
        assert!(t.tick().is_none());
        assert_eq!(t.remaining_secs, 25 * 60);
    }

    #[test]
    fn tick_decrements_when_running() {
        let mut t = Timer::new(cfg(25, 5, 15, 4, false));
        t.toggle();
        assert!(t.tick().is_none());
        assert_eq!(t.remaining_secs, 25 * 60 - 1);
    }

    #[test]
    fn finishing_work_goes_to_short_break() {
        let mut t = Timer::new(cfg(1, 5, 15, 4, true));
        t.remaining_secs = 1;
        t.running = true;
        assert_eq!(t.tick(), Some(Phase::Work));
        assert_eq!(t.phase, Phase::ShortBreak);
        assert_eq!(t.cycle_count, 1);
        assert_eq!(t.total_secs, 5 * 60);
        assert!(t.running, "auto-advance should start the break");
    }

    #[test]
    fn auto_advance_off_leaves_break_paused() {
        let mut t = Timer::new(cfg(1, 5, 15, 4, false));
        t.remaining_secs = 1;
        t.running = true;
        t.tick();
        assert_eq!(t.phase, Phase::ShortBreak);
        assert!(!t.running);
    }

    #[test]
    fn fourth_work_goes_to_long_break() {
        let mut t = Timer::new(cfg(1, 5, 15, 4, false));
        t.phase = Phase::Work;
        t.cycle_count = 3;
        assert_eq!(t.advance(), Phase::Work);
        assert_eq!(t.cycle_count, 4);
        assert_eq!(t.phase, Phase::LongBreak);
        assert_eq!(t.total_secs, 15 * 60);
    }

    #[test]
    fn long_break_resets_cycle() {
        let mut t = Timer::new(cfg(1, 5, 15, 4, false));
        t.phase = Phase::LongBreak;
        t.cycle_count = 4;
        t.advance();
        assert_eq!(t.phase, Phase::Work);
        assert_eq!(t.cycle_count, 0);
    }

    #[test]
    fn short_break_returns_to_work() {
        let mut t = Timer::new(cfg(1, 5, 15, 4, false));
        t.phase = Phase::ShortBreak;
        t.advance();
        assert_eq!(t.phase, Phase::Work);
        assert_eq!(t.total_secs, 1 * 60);
    }

    #[test]
    fn skip_does_not_count_a_session() {
        let mut t = Timer::new(cfg(25, 5, 15, 4, false));
        t.cycle_count = 2;
        t.skip();
        assert_eq!(t.phase, Phase::ShortBreak);
        assert_eq!(t.cycle_count, 2);
        assert!(!t.running);
    }

    #[test]
    fn reset_restarts_current_phase() {
        let mut t = Timer::new(cfg(25, 5, 15, 4, false));
        t.remaining_secs = 10;
        t.running = true;
        t.reset();
        assert_eq!(t.remaining_secs, 25 * 60);
        assert!(!t.running);
    }

    #[test]
    fn apply_config_resizes_idle_phase() {
        let mut t = Timer::new(cfg(25, 5, 15, 4, false));
        t.apply_config(cfg(30, 5, 15, 4, false));
        assert_eq!(t.total_secs, 30 * 60);
        assert_eq!(t.remaining_secs, 30 * 60);
    }

    #[test]
    fn apply_config_preserves_running_progress() {
        let mut t = Timer::new(cfg(25, 5, 15, 4, false));
        t.running = true;
        t.remaining_secs = 600;
        t.apply_config(cfg(30, 5, 15, 4, false));
        assert_eq!(t.remaining_secs, 600);
    }

    // ---- Wire format ----------------------------------------------------
    // The frontend sends `config` as a struct-typed command argument, which
    // serde deserialises using the Rust field names (snake_case).

    #[test]
    fn config_deserialises_from_snake_case_json() {
        let json = serde_json::json!({
            "work_minutes": 30,
            "short_break_minutes": 5,
            "long_break_minutes": 15,
            "long_break_interval": 4,
            "auto_advance": true,
            "sound_enabled": false
        });
        let cfg: Config = serde_json::from_value(json).unwrap();
        assert_eq!(cfg.work_minutes, 30);
        assert_eq!(cfg.short_break_minutes, 5);
        assert_eq!(cfg.long_break_minutes, 15);
        assert_eq!(cfg.long_break_interval, 4);
        assert!(cfg.auto_advance);
        assert!(!cfg.sound_enabled);
    }

    #[test]
    fn config_serialises_with_expected_keys() {
        let value = serde_json::to_value(Config::default()).unwrap();
        for key in [
            "work_minutes",
            "short_break_minutes",
            "long_break_minutes",
            "long_break_interval",
            "auto_advance",
            "sound_enabled",
        ] {
            assert!(value.get(key).is_some(), "missing key: {key}");
        }
    }
}
