/* Window chrome: auto-hiding controls, reveal-on-hover, JS resize via the grips,
 * fullscreen toggle, and the click-through come-back behavior. Moving the window
 * is handled natively by the `-webkit-app-region: drag` surface in the markup;
 * only resizing and the interactive bits need JS here. */
import { CHROME_HIDE_MS, MIN_W, MIN_H, REVEAL_W, REVEAL_H } from "./config.js";
import { bridge } from "./bridge.js";
import { el } from "./hud.js";
import { setMode, toggleMode, togglePause } from "./engine.js";
import { cycleTheme } from "./themes.js";

let throughOn = false;
let chromeHidden = false;
let hideAt = performance.now() + CHROME_HIDE_MS;
let cachedBounds = null; // last known window bounds (for move/resize math)
let drag = null; // active resize gesture

// Show the chrome and (re)arm the idle hide timer.
export function revealChrome() {
  if (chromeHidden) {
    chromeHidden = false;
    document.body.classList.remove("chrome-hidden");
  }
  hideAt = performance.now() + CHROME_HIDE_MS;
}

// Called every frame: hide once idle (but never mid-drag).
export function tickChrome(now) {
  if (!chromeHidden && !drag && now > hideAt) {
    chromeHidden = true;
    document.body.classList.add("chrome-hidden");
  }
}

// Arm the idle timer to fire on the next frame (test/debug hook).
export function hideChromeNow() {
  hideAt = performance.now() - 1;
}

export function isChromeHidden() {
  return chromeHidden;
}

export async function refreshBounds() {
  if (bridge) cachedBounds = await bridge.getBounds();
}

// Click-through implies you're working behind the overlay -> switch to ambient.
export function handleThrough(on) {
  throughOn = on;
  document.body.classList.toggle("through", on);
  revealChrome();
  setMode(on ? "ambient" : "play");
}

// --- resize (drag a grip) ---------------------------------------------------
function beginResize(e, edge) {
  if (throughOn || !bridge || !cachedBounds) return;
  e.stopPropagation();
  drag = {
    edge,
    start: { ...cachedBounds },
    sx: e.screenX,
    sy: e.screenY,
  };
  document.body.classList.add("managing");
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch (_) {}
}

// Active resize drag.
function onResizeMove(e) {
  if (!drag || !bridge) return;
  revealChrome();
  let { x, y, width, height } = drag.start;
  const dx = e.screenX - drag.sx;
  const dy = e.screenY - drag.sy;
  const ed = drag.edge;
  if (ed.includes("e")) width = drag.start.width + dx;
  if (ed.includes("s")) height = drag.start.height + dy;
  if (ed.includes("w")) {
    width = drag.start.width - dx;
    x = drag.start.x + dx;
  }
  if (ed.includes("n")) {
    height = drag.start.height - dy;
    y = drag.start.y + dy;
  }
  if (width < MIN_W) {
    if (ed.includes("w")) x -= MIN_W - width;
    width = MIN_W;
  }
  if (height < MIN_H) {
    if (ed.includes("n")) y -= MIN_H - height;
    height = MIN_H;
  }
  cachedBounds = { x, y, width, height };
  bridge.setBounds(cachedBounds);
}

function onPointerUp() {
  if (!drag) return;
  drag = null;
  document.body.classList.remove("managing");
  revealChrome();
  refreshBounds();
}

// Hover: reveal the chrome near the top-left, and keep the come-back buttons
// clickable while click-through is on. Bound to both mouse + pointer move so it
// works with the forwarded events we get during click-through.
function onHover(e) {
  if (e.clientX < REVEAL_W && e.clientY < REVEAL_H) revealChrome();
  if (throughOn && bridge) {
    const r = el.controls.getBoundingClientRect();
    const pad = 8;
    const over =
      e.clientX >= r.left - pad &&
      e.clientX <= r.right + pad &&
      e.clientY >= r.top - pad &&
      e.clientY <= r.bottom + pad;
    bridge.setInteractive(over);
    if (over) revealChrome();
  }
}

export function setupControls() {
  el.btnThrough.addEventListener("click", () => bridge && bridge.setThrough(!throughOn));
  el.btnMode.addEventListener("click", toggleMode);
  el.btnPause.addEventListener("click", togglePause);
  el.btnQuit.addEventListener("click", () => bridge && bridge.quit());
  if (el.btnColor) el.btnColor.addEventListener("click", cycleTheme);

  // Resize grips (the rest of the surface is a native drag region).
  el.frame.querySelectorAll(".grip").forEach((g) => {
    g.addEventListener("pointerdown", (e) => beginResize(e, g.dataset.edge));
  });

  // Double-click the top-left (controls bar / reveal zone) to toggle fullscreen.
  // The drag surface itself is a native drag region, which swallows dblclick, so
  // we listen on these no-drag spots instead.
  const dblFull = (e) => {
    if (e.target.closest && e.target.closest("button")) return;
    if (!throughOn && bridge) bridge.toggleFull();
  };
  el.controls.addEventListener("dblclick", dblFull);
  if (el.revealzone) {
    el.revealzone.addEventListener("dblclick", dblFull);
    el.revealzone.addEventListener("mousemove", revealChrome);
  }
  window.addEventListener("mousemove", onHover);
  window.addEventListener("pointermove", onHover);
  window.addEventListener("pointermove", onResizeMove);
  window.addEventListener("pointerup", onPointerUp);
  // Keep cached bounds fresh after any (incl. native) resize.
  window.addEventListener("resize", refreshBounds);
}
