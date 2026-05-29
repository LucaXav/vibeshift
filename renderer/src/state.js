/* Central mutable game state. One shared object so every module reads and
 * writes the same live values (no stale copies, no globals on window). */

export const state = {
  displayMode: "play", // 'play' | 'ambient'
  playState: "ready", // 'ready' | 'running' | 'over'
  paused: false,

  ship: null,
  bullets: [],
  asteroids: [],
  particles: [],

  score: 0,
  lives: 3,
  level: 1,
  invuln: 0, // seconds of spawn protection
  respawnTimer: 0,

  hiscore: 0,
};

// Restore the persisted high score (best effort — storage may be unavailable).
try {
  state.hiscore = parseInt(localStorage.getItem("pewpew.hi") || "0", 10) || 0;
} catch (e) {}
