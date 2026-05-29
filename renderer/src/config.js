/* Tunable constants and lookup tables for the whole game. Pure data — no logic,
 * no DOM — so any module can import from here without side effects. */

export const TAU = Math.PI * 2;

// Asteroid tier -> base radius / score awarded when destroyed.
export const SIZES = { 3: 56, 2: 32, 1: 16 };
export const SCORES = { 3: 20, 2: 50, 1: 100 };

// Controls/frame fade out after this much idle time (ms).
export const CHROME_HIDE_MS = 4000;

// Minimum window size (kept in sync with main.js MIN_W/MIN_H).
export const MIN_W = 320;
export const MIN_H = 240;

// Top-left "jiggle here to reveal the chrome" zone (px).
export const REVEAL_W = 320;
export const REVEAL_H = 130;

// Color themes. "auto" samples the desktop behind the transparent window and
// flips to a contrasting color so the graphics pop over whatever they sit on.
export const THEMES = [
  { id: "white", ink: "#ffffff", glow: "rgba(255,255,255,0.6)" },
  { id: "green", ink: "#33ff66", glow: "rgba(51,255,102,0.55)" }, // retro CRT phosphor
  { id: "amber", ink: "#ffb22e", glow: "rgba(255,178,46,0.5)" },
  { id: "cyan", ink: "#3ad7ff", glow: "rgba(58,215,255,0.5)" },
  { id: "auto", ink: "#33ff66", glow: "rgba(51,255,102,0.55)" }, // resolved live
];

// Colors auto-mode picks based on the sampled background brightness.
export const AUTO_DARK = { ink: "#33ff66", glow: "rgba(51,255,102,0.6)" }; // dark bg -> green
export const AUTO_LIGHT = { ink: "#0c1230", glow: "rgba(12,18,48,0.45)" }; // light bg -> ink
