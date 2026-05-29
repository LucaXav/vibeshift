/* Draws the whole scene on the transparent canvas — cleared to alpha 0 each
 * frame so only the wireframes show and the desktop shows through everywhere
 * else. Reads `state` and `paint`; mutates nothing. */
import { view, ctx } from "./view.js";
import { TAU } from "./config.js";
import { state } from "./state.js";
import { paint } from "./themes.js";

function drawAsteroid(a) {
  ctx.beginPath();
  const n = a.shape.length;
  for (let i = 0; i < n; i++) {
    const ang = a.a + (i / n) * TAU;
    const rr = a.r * a.shape[i];
    const x = a.x + Math.cos(ang) * rr;
    const y = a.y + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawShip() {
  const ship = state.ship;
  if (!ship) return;
  // blink while invulnerable
  if (state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0) return;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.a);
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-12, -11);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-12, 11);
  ctx.closePath();
  ctx.stroke();
  // thrust flame
  if (ship.thrust && Math.random() > 0.35) {
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-18 - Math.random() * 6, 0);
    ctx.lineTo(-6, 5);
    ctx.stroke();
  }
  ctx.restore();
}

export function render() {
  ctx.clearRect(0, 0, view.W, view.H); // fully transparent each frame

  ctx.strokeStyle = paint.ink;
  ctx.fillStyle = paint.ink;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.shadowColor = paint.glow;
  ctx.shadowBlur = 6;

  for (const a of state.asteroids) drawAsteroid(a);

  ctx.shadowBlur = 4;
  for (const b of state.bullets) {
    ctx.fillRect(b.x - 2, b.y - 2, 4, 4); // chunky pixel bullet
  }

  drawShip();

  // particles
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}
