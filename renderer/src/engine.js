/* The Asteroids engine: lifecycle (start/level/mode), input, and the per-frame
 * physics + collision update. Mutates `state`; the renderer reads it. */
import { view } from "./view.js";
import { SCORES } from "./config.js";
import { rand, randi, wrap } from "./utils.js";
import { state } from "./state.js";
import { makeShip, makeAsteroid, spawnParticles } from "./entities.js";
import { updateHUD, showBanner, hideBanner, popScore, updatePauseIcon } from "./hud.js";

// --- Level / lifecycle -------------------------------------------------------
export function startGame() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.bullets = [];
  state.particles = [];
  state.ship = makeShip();
  state.invuln = 2.5;
  spawnLevel();
  state.playState = "running";
  hideBanner();
  updateHUD();
}

function spawnLevel() {
  state.asteroids = [];
  const count = 3 + state.level;
  for (let i = 0; i < count; i++) {
    // Keep new rocks away from the ship's center spawn.
    let a;
    do {
      a = makeAsteroid(3);
    } while (state.ship && Math.hypot(a.x - state.ship.x, a.y - state.ship.y) < 180);
    state.asteroids.push(a);
  }
}

function ambientField() {
  state.asteroids = [];
  state.bullets = [];
  const count = Math.max(6, Math.round((view.W * view.H) / 220000));
  for (let i = 0; i < count; i++) {
    state.asteroids.push(makeAsteroid(randi(1, 3), undefined, undefined, true));
  }
}

export function setMode(mode) {
  state.displayMode = mode;
  if (mode === "ambient") {
    ambientField();
    hideBanner();
  } else {
    state.playState = "ready";
    state.ship = makeShip();
    state.bullets = [];
    state.asteroids = [];
    for (let i = 0; i < 5; i++) state.asteroids.push(makeAsteroid(3, undefined, undefined, true));
    showBanner("PEWPEW", "PRESS SPACE / FIRE TO START");
  }
  updateHUD();
}

export function toggleMode() {
  setMode(state.displayMode === "play" ? "ambient" : "play");
}

export function togglePause() {
  state.paused = !state.paused;
  updatePauseIcon();
}

function loseLife() {
  spawnParticles(state.ship.x, state.ship.y, 40, 220, 1.0);
  state.lives--;
  updateHUD();
  if (state.lives <= 0) {
    state.playState = "over";
    state.ship = null;
    if (state.score > state.hiscore) {
      state.hiscore = state.score;
      try {
        localStorage.setItem("pewpew.hi", String(state.hiscore));
      } catch (e) {}
    }
    showBanner("GAME OVER", "SCORE " + state.score + " — FIRE TO RETRY");
  } else {
    state.respawnTimer = 1.2; // brief pause before respawn
  }
}

function splitAsteroid(idx) {
  const a = state.asteroids[idx];
  state.score += SCORES[a.tier];
  updateHUD();
  if (state.displayMode === "play") popScore(SCORES[a.tier]);
  spawnParticles(a.x, a.y, 14 + a.tier * 6, 120 + a.tier * 30, 0.7);
  state.asteroids.splice(idx, 1);
  if (a.tier > 1) {
    const children = 2;
    for (let i = 0; i < children; i++) {
      const child = makeAsteroid(a.tier - 1, a.x, a.y);
      // push children apart a bit
      child.vx += rand(-30, 30);
      child.vy += rand(-30, 30);
      state.asteroids.push(child);
    }
  }
  if (state.displayMode === "play" && state.asteroids.length === 0) {
    state.level++;
    state.invuln = 1.5;
    spawnLevel();
  }
}

export function fire() {
  const ship = state.ship;
  if (!ship || ship.cooldown > 0) return;
  if (state.bullets.length > 6) return;
  const speed = 520;
  state.bullets.push({
    x: ship.x + Math.cos(ship.a) * ship.r,
    y: ship.y + Math.sin(ship.a) * ship.r,
    vx: Math.cos(ship.a) * speed + ship.vx,
    vy: Math.sin(ship.a) * speed + ship.vy,
    r: 2,
    life: 0.9,
  });
  ship.cooldown = 0.18;
}

// --- Input -------------------------------------------------------------------
export const keys = Object.create(null);

const HANDLED = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "a", "d", "w", "A", "D", "W"];

function onKey(e, down) {
  const k = e.key;
  if (HANDLED.includes(k)) e.preventDefault();

  if (k === "ArrowLeft" || k === "a" || k === "A") keys.left = down;
  if (k === "ArrowRight" || k === "d" || k === "D") keys.right = down;
  if (k === "ArrowUp" || k === "w" || k === "W") keys.up = down;
  if (k === " " || k === "Enter") {
    if (down) {
      if (state.displayMode === "play" && state.playState !== "running") startGame();
      else keys.fireQueued = true;
    }
  }
}
window.addEventListener("keydown", (e) => onKey(e, true));
window.addEventListener("keyup", (e) => onKey(e, false));

// --- Update ------------------------------------------------------------------
export function update(dt) {
  // Asteroids always move (both modes).
  for (const a of state.asteroids) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.a += a.spin * dt;
    wrap(a);
  }

  // Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  if (state.displayMode !== "play" || state.playState !== "running") return;

  if (state.invuln > 0) state.invuln -= dt;

  if (state.respawnTimer > 0) {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) {
      state.ship = makeShip();
      state.invuln = 2.0;
    }
    return; // ship is gone during respawn pause
  }

  const ship = state.ship;
  if (!ship) return;

  // Ship rotation & thrust
  const TURN = 3.4;
  if (keys.left) ship.a -= TURN * dt;
  if (keys.right) ship.a += TURN * dt;
  ship.thrust = !!keys.up;
  if (ship.thrust) {
    const ACC = 320;
    ship.vx += Math.cos(ship.a) * ACC * dt;
    ship.vy += Math.sin(ship.a) * ACC * dt;
  }
  // friction + speed cap
  ship.vx *= Math.pow(0.55, dt);
  ship.vy *= Math.pow(0.55, dt);
  const sp = Math.hypot(ship.vx, ship.vy);
  const MAX = 460;
  if (sp > MAX) {
    ship.vx = (ship.vx / sp) * MAX;
    ship.vy = (ship.vy / sp) * MAX;
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  wrap(ship);

  if (ship.cooldown > 0) ship.cooldown -= dt;
  if (keys.fireQueued) {
    fire();
    keys.fireQueued = false;
  }

  // Bullets
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    wrap(b);
    if (b.life <= 0) {
      state.bullets.splice(i, 1);
      continue;
    }
    // bullet vs asteroid
    for (let j = state.asteroids.length - 1; j >= 0; j--) {
      const a = state.asteroids[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r) {
        state.bullets.splice(i, 1);
        splitAsteroid(j);
        break;
      }
    }
  }

  // ship vs asteroid
  if (state.invuln <= 0 && state.ship) {
    for (let j = 0; j < state.asteroids.length; j++) {
      const a = state.asteroids[j];
      if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.r + ship.r * 0.7) {
        loseLife();
        break;
      }
    }
  }
}
