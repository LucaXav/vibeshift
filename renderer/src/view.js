/* The transparent canvas and its device-pixel-ratio-aware sizing.
 *
 * `view` holds the current logical viewport size (W/H in CSS px) and the DPR.
 * It's a mutable object so other modules read fresh values through it after a
 * resize, rather than capturing stale primitives. */

export const canvas = document.getElementById("game");
export const ctx = canvas.getContext("2d", { alpha: true });

export const view = { W: 0, H: 0, DPR: 1 };

export function resize() {
  view.DPR = Math.max(1, window.devicePixelRatio || 1);
  view.W = window.innerWidth;
  view.H = window.innerHeight;
  canvas.width = Math.floor(view.W * view.DPR);
  canvas.height = Math.floor(view.H * view.DPR);
  canvas.style.width = view.W + "px";
  canvas.style.height = view.H + "px";
  // Draw in CSS pixels; the DPR transform scales up to physical pixels.
  ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
}

window.addEventListener("resize", resize);
resize();
