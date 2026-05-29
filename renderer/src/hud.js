/* The DOM overlay: score/lives readout, the center banner, the "+N" score pop,
 * and the pause-button icon swap. Reads game state; never mutates it. */
import { state } from "./state.js";

// All the chrome/HUD elements, looked up once.
export const el = {
  score: document.getElementById("score"),
  hiscore: document.getElementById("hiscore"),
  lives: document.getElementById("lives"),
  mode: document.getElementById("mode"),
  banner: document.getElementById("banner"),
  bannerTitle: document.getElementById("banner-title"),
  bannerSub: document.getElementById("banner-sub"),
  controls: document.getElementById("controls"),
  frame: document.getElementById("frame"),
  revealzone: document.getElementById("revealzone"),
  scorepop: document.getElementById("scorepop"),
  btnThrough: document.getElementById("btn-through"),
  btnMode: document.getElementById("btn-mode"),
  btnPause: document.getElementById("btn-pause"),
  btnQuit: document.getElementById("btn-quit"),
  btnColor: document.getElementById("btn-color"),
};

// Swap the pause button between |‍| (pause) and ▶ (play) to mirror state.
const PAUSE_SVG =
  '<rect x="6" y="5" width="4" height="14" rx="1" class="fill" />' +
  '<rect x="14" y="5" width="4" height="14" rx="1" class="fill" />';
const PLAY_SVG = '<path d="M7 5 L19 12 L7 19 Z" class="fill" />';

export function updatePauseIcon() {
  const svg = el.btnPause.querySelector("svg");
  if (svg) svg.innerHTML = state.paused ? PLAY_SVG : PAUSE_SVG;
}

// Pop a "+N" tile near the score when a rock is destroyed (right-hand side).
export function popScore(n) {
  if (!el.scorepop) return;
  const tile = document.createElement("div");
  tile.className = "pop";
  tile.textContent = "+" + n;
  el.scorepop.appendChild(tile);
  setTimeout(() => tile.remove(), 760);
}

export function updateHUD() {
  el.score.textContent = "SCORE " + state.score;
  el.hiscore.textContent = "HI " + Math.max(state.hiscore, state.score);
  el.lives.textContent = state.lives > 0 ? "▲ ".repeat(state.lives).trim() : "—";
  el.mode.textContent = state.displayMode.toUpperCase();
}

export function showBanner(title, sub) {
  el.bannerTitle.textContent = title;
  el.bannerSub.textContent = sub;
  el.banner.classList.remove("hidden");
}

export function hideBanner() {
  el.banner.classList.add("hidden");
}
