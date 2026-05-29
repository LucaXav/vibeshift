/* Factories for the things on screen: the ship, asteroids, and explosion
 * particles. They only build/append objects — movement and collisions live in
 * the engine. */
import { view } from "./view.js";
import { TAU, SIZES } from "./config.js";
import { rand, randi } from "./utils.js";
import { state } from "./state.js";

export function makeShip() {
  return {
    x: view.W / 2,
    y: view.H / 2,
    r: 16,
    a: -Math.PI / 2, // pointing up
    vx: 0,
    vy: 0,
    thrust: false,
    cooldown: 0,
  };
}

export function makeAsteroid(tier, x, y, gentle) {
  const r = SIZES[tier] * rand(0.85, 1.15);
  // Gentle (ambient) rocks drift slowly; play rocks speed up with the level.
  const speed = gentle ? rand(8, 26) : rand(24, 70) + (state.level - 1) * 6;
  const ang = rand(0, TAU);
  // Pre-baked jagged silhouette for a chunky 8-bit-ish wireframe rock.
  const verts = randi(8, 12);
  const shape = [];
  for (let i = 0; i < verts; i++) {
    shape.push(rand(0.68, 1.0));
  }
  return {
    tier,
    x: x ?? rand(0, view.W),
    y: y ?? rand(0, view.H),
    r,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    a: rand(0, TAU),
    spin: rand(-1.2, 1.2),
    shape,
  };
}

export function spawnParticles(x, y, n, spread, life) {
  for (let i = 0; i < n; i++) {
    const ang = rand(0, TAU);
    const sp = rand(spread * 0.3, spread);
    state.particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: rand(life * 0.5, life),
      maxLife: life,
      size: randi(1, 3),
    });
  }
}
