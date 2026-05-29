/* PewPew — 8-bit white Asteroids, drawn on a transparent canvas so it floats
 * over whatever is behind the overlay (your editor, terminal, anything).
 *
 * Two display modes:
 *   PLAY    — you fly the ship, shoot asteroids, score, avoid collisions.
 *   AMBIENT — asteroids just drift across the screen (screensaver). Pairs with
 *             click-through so you can read/edit the code behind the overlay.
 *
 * Runs identically in Electron and in a plain browser (window.pew is optional),
 * which lets it be tested in an automated browser.
 */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });
  const bridge = window.pew || null; // Electron IPC bridge, if present

  // --- DPR-aware sizing ------------------------------------------------------
  let W = 0,
    H = 0,
    DPR = 1;
  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // --- Helpers ---------------------------------------------------------------
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  function wrap(o) {
    if (o.x < -o.r) o.x = W + o.r;
    else if (o.x > W + o.r) o.x = -o.r;
    if (o.y < -o.r) o.y = H + o.r;
    else if (o.y > H + o.r) o.y = -o.r;
  }

  // --- Game state ------------------------------------------------------------
  const SIZES = { 3: 56, 2: 32, 1: 16 }; // tier -> base radius
  const SCORES = { 3: 20, 2: 50, 1: 100 };
  const CHROME_HIDE_MS = 4000; // controls/frame fade out after this idle time

  // Color themes. "auto" samples the desktop behind the transparent window and
  // flips to a contrasting color so the graphics pop over whatever they sit on.
  const THEMES = [
    { id: "white", ink: "#ffffff", glow: "rgba(255,255,255,0.6)" },
    { id: "green", ink: "#33ff66", glow: "rgba(51,255,102,0.55)" }, // retro CRT phosphor
    { id: "amber", ink: "#ffb22e", glow: "rgba(255,178,46,0.5)" },
    { id: "cyan", ink: "#3ad7ff", glow: "rgba(58,215,255,0.5)" },
    { id: "auto", ink: "#33ff66", glow: "rgba(51,255,102,0.55)" }, // resolved live
  ];
  // Colors auto-mode picks based on the sampled background brightness.
  const AUTO_DARK = { ink: "#33ff66", glow: "rgba(51,255,102,0.6)" }; // dark bg -> green
  const AUTO_LIGHT = { ink: "#0c1230", glow: "rgba(12,18,48,0.45)" }; // light bg -> ink
  let themeIndex = 0;
  let ink = "#ffffff";
  let glow = "rgba(255,255,255,0.6)";
  let autoTimer = null;

  let displayMode = "play"; // 'play' | 'ambient'
  let playState = "ready"; // 'ready' | 'running' | 'over'
  let paused = false;

  let ship = null;
  let bullets = [];
  let asteroids = [];
  let particles = [];

  let score = 0;
  let lives = 3;
  let level = 1;
  let invuln = 0; // seconds of spawn protection
  let respawnTimer = 0;

  let hiscore = 0;
  try {
    hiscore = parseInt(localStorage.getItem("pewpew.hi") || "0", 10) || 0;
    const savedTheme = localStorage.getItem("pewpew.theme");
    const idx = THEMES.findIndex((t) => t.id === savedTheme);
    if (idx >= 0) themeIndex = idx;
  } catch (e) {}

  // --- HUD elements ----------------------------------------------------------
  const el = {
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
  function updatePauseIcon() {
    const svg = el.btnPause.querySelector("svg");
    if (svg) svg.innerHTML = paused ? PLAY_SVG : PAUSE_SVG;
  }

  // Pop a "+N" tile near the score when a rock is destroyed (right-hand side).
  function popScore(n) {
    if (!el.scorepop) return;
    const tile = document.createElement("div");
    tile.className = "pop";
    tile.textContent = "+" + n;
    el.scorepop.appendChild(tile);
    setTimeout(() => tile.remove(), 760);
  }

  function updateHUD() {
    el.score.textContent = "SCORE " + score;
    el.hiscore.textContent = "HI " + Math.max(hiscore, score);
    el.lives.textContent = lives > 0 ? "▲ ".repeat(lives).trim() : "—";
    el.mode.textContent = displayMode.toUpperCase();
  }

  function showBanner(title, sub) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub;
    el.banner.classList.remove("hidden");
  }
  function hideBanner() {
    el.banner.classList.add("hidden");
  }

  // --- Factories -------------------------------------------------------------
  function makeShip() {
    return {
      x: W / 2,
      y: H / 2,
      r: 16,
      a: -Math.PI / 2, // pointing up
      vx: 0,
      vy: 0,
      thrust: false,
      cooldown: 0,
    };
  }

  function makeAsteroid(tier, x, y, gentle) {
    const r = SIZES[tier] * rand(0.85, 1.15);
    const speed = gentle ? rand(8, 26) : rand(24, 70) + (level - 1) * 6;
    const ang = rand(0, TAU);
    // Pre-baked jagged silhouette for a chunky 8-bit-ish wireframe rock.
    const verts = randi(8, 12);
    const shape = [];
    for (let i = 0; i < verts; i++) {
      shape.push(rand(0.68, 1.0));
    }
    return {
      tier,
      x: x ?? rand(0, W),
      y: y ?? rand(0, H),
      r,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      a: rand(0, TAU),
      spin: rand(-1.2, 1.2),
      shape,
    };
  }

  function spawnParticles(x, y, n, spread, life) {
    for (let i = 0; i < n; i++) {
      const ang = rand(0, TAU);
      const sp = rand(spread * 0.3, spread);
      particles.push({
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

  // --- Level / lifecycle -----------------------------------------------------
  function startGame() {
    score = 0;
    lives = 3;
    level = 1;
    bullets = [];
    particles = [];
    ship = makeShip();
    invuln = 2.5;
    spawnLevel();
    playState = "running";
    hideBanner();
    updateHUD();
  }

  function spawnLevel() {
    asteroids = [];
    const count = 3 + level;
    for (let i = 0; i < count; i++) {
      // Keep new rocks away from the ship's center spawn.
      let a;
      do {
        a = makeAsteroid(3);
      } while (ship && Math.hypot(a.x - ship.x, a.y - ship.y) < 180);
      asteroids.push(a);
    }
  }

  function ambientField() {
    asteroids = [];
    bullets = [];
    const count = Math.max(6, Math.round((W * H) / 220000));
    for (let i = 0; i < count; i++) {
      asteroids.push(makeAsteroid(randi(1, 3), undefined, undefined, true));
    }
  }

  function setMode(mode) {
    displayMode = mode;
    if (mode === "ambient") {
      ambientField();
      hideBanner();
    } else {
      playState = "ready";
      ship = makeShip();
      bullets = [];
      asteroids = [];
      for (let i = 0; i < 5; i++) asteroids.push(makeAsteroid(3, undefined, undefined, true));
      showBanner("PEWPEW", "PRESS SPACE / FIRE TO START");
    }
    updateHUD();
  }

  function loseLife() {
    spawnParticles(ship.x, ship.y, 40, 220, 1.0);
    lives--;
    updateHUD();
    if (lives <= 0) {
      playState = "over";
      ship = null;
      if (score > hiscore) {
        hiscore = score;
        try {
          localStorage.setItem("pewpew.hi", String(hiscore));
        } catch (e) {}
      }
      showBanner("GAME OVER", "SCORE " + score + " — FIRE TO RETRY");
    } else {
      respawnTimer = 1.2; // brief pause before respawn
    }
  }

  function splitAsteroid(idx) {
    const a = asteroids[idx];
    score += SCORES[a.tier];
    updateHUD();
    if (displayMode === "play") popScore(SCORES[a.tier]);
    spawnParticles(a.x, a.y, 14 + a.tier * 6, 120 + a.tier * 30, 0.7);
    asteroids.splice(idx, 1);
    if (a.tier > 1) {
      const children = 2;
      for (let i = 0; i < children; i++) {
        const child = makeAsteroid(a.tier - 1, a.x, a.y);
        // push children apart a bit
        child.vx += rand(-30, 30);
        child.vy += rand(-30, 30);
        asteroids.push(child);
      }
    }
    if (displayMode === "play" && asteroids.length === 0) {
      level++;
      invuln = 1.5;
      spawnLevel();
    }
  }

  function fire() {
    if (!ship || ship.cooldown > 0) return;
    if (bullets.length > 6) return;
    const speed = 520;
    bullets.push({
      x: ship.x + Math.cos(ship.a) * ship.r,
      y: ship.y + Math.sin(ship.a) * ship.r,
      vx: Math.cos(ship.a) * speed + ship.vx,
      vy: Math.sin(ship.a) * speed + ship.vy,
      r: 2,
      life: 0.9,
    });
    ship.cooldown = 0.18;
  }

  // --- Input -----------------------------------------------------------------
  const keys = Object.create(null);
  function onKey(e, down) {
    const k = e.key;
    const handled = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      " ",
      "a",
      "d",
      "w",
      "A",
      "D",
      "W",
    ];
    if (handled.includes(k)) e.preventDefault();

    if (k === "ArrowLeft" || k === "a" || k === "A") keys.left = down;
    if (k === "ArrowRight" || k === "d" || k === "D") keys.right = down;
    if (k === "ArrowUp" || k === "w" || k === "W") keys.up = down;
    if (k === " " || k === "Enter") {
      if (down) {
        if (displayMode === "play" && playState !== "running") startGame();
        else keys.fireQueued = true;
      }
    }
  }
  window.addEventListener("keydown", (e) => onKey(e, true));
  window.addEventListener("keyup", (e) => onKey(e, false));

  // --- Update ----------------------------------------------------------------
  function update(dt) {
    // Asteroids always move (both modes).
    for (const a of asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.a += a.spin * dt;
      wrap(a);
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (displayMode !== "play" || playState !== "running") return;

    if (invuln > 0) invuln -= dt;

    if (respawnTimer > 0) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        ship = makeShip();
        invuln = 2.0;
      }
      return; // ship is gone during respawn pause
    }

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
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      wrap(b);
      if (b.life <= 0) {
        bullets.splice(i, 1);
        continue;
      }
      // bullet vs asteroid
      for (let j = asteroids.length - 1; j >= 0; j--) {
        const a = asteroids[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r) {
          bullets.splice(i, 1);
          splitAsteroid(j);
          break;
        }
      }
    }

    // ship vs asteroid
    if (invuln <= 0 && ship) {
      for (let j = 0; j < asteroids.length; j++) {
        const a = asteroids[j];
        if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.r + ship.r * 0.7) {
          loseLife();
          break;
        }
      }
    }
  }

  // --- Render ----------------------------------------------------------------
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
    if (!ship) return;
    // blink while invulnerable
    if (invuln > 0 && Math.floor(invuln * 12) % 2 === 0) return;
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

  function render() {
    ctx.clearRect(0, 0, W, H); // fully transparent each frame

    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.shadowColor = glow;
    ctx.shadowBlur = 6;

    for (const a of asteroids) drawAsteroid(a);

    ctx.shadowBlur = 4;
    for (const b of bullets) {
      ctx.fillRect(b.x - 2, b.y - 2, 4, 4); // chunky pixel bullet
    }

    drawShip();

    // particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  // --- Main loop -------------------------------------------------------------
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp big stalls
    if (!paused) {
      update(dt);
      render();
    }
    tickChrome(now); // fade the controls/frame out when idle
    requestAnimationFrame(loop);
  }

  // --- Chrome: auto-hide, reveal-on-jiggle, move, resize, fullscreen --------
  let throughOn = false;
  let chromeHidden = false;
  let hideAt = performance.now() + CHROME_HIDE_MS;
  let cachedBounds = null; // last known window bounds (for move/resize math)
  let drag = null; // active move/resize gesture
  const REVEAL_W = 320; // top-left "jiggle here" reveal zone
  const REVEAL_H = 130;

  function toggleMode() {
    setMode(displayMode === "play" ? "ambient" : "play");
  }
  function togglePause() {
    paused = !paused;
    updatePauseIcon();
  }

  // --- Color themes ----------------------------------------------------------
  function setInk(i, g) {
    ink = i;
    glow = g;
    document.documentElement.style.setProperty("--ink", i);
    document.documentElement.style.setProperty("--glow", "0 0 6px " + g);
  }
  function stopAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }
  async function sampleOnce() {
    if (!bridge) return;
    const s = await bridge.sampleBg();
    if (!s || typeof s.lum !== "number") return;
    const pick = s.lum < 0.5 ? AUTO_DARK : AUTO_LIGHT;
    setInk(pick.ink, pick.glow);
  }
  function startAuto() {
    if (!bridge) {
      setInk(AUTO_DARK.ink, AUTO_DARK.glow); // browser fallback (no capture API)
      return;
    }
    sampleOnce();
    stopAuto();
    autoTimer = setInterval(sampleOnce, 2000); // re-check the background
  }
  function applyTheme() {
    const t = THEMES[themeIndex];
    if (t.id === "auto") startAuto();
    else {
      stopAuto();
      setInk(t.ink, t.glow);
    }
    if (el.btnColor) el.btnColor.title = "Color: " + t.id.toUpperCase() + " — click to change";
    try {
      localStorage.setItem("pewpew.theme", t.id);
    } catch (e) {}
  }
  function cycleTheme() {
    themeIndex = (themeIndex + 1) % THEMES.length;
    applyTheme();
  }

  // Show the chrome and (re)arm the idle hide timer.
  function revealChrome() {
    if (chromeHidden) {
      chromeHidden = false;
      document.body.classList.remove("chrome-hidden");
    }
    hideAt = performance.now() + CHROME_HIDE_MS;
  }
  // Called every frame: hide once idle (but never mid-drag).
  function tickChrome(now) {
    if (!chromeHidden && !drag && now > hideAt) {
      chromeHidden = true;
      document.body.classList.add("chrome-hidden");
    }
  }

  async function refreshBounds() {
    if (bridge) cachedBounds = await bridge.getBounds();
  }

  // Moving the window is handled natively: the whole surface is a
  // `-webkit-app-region: drag` region, so you can grab it anywhere and throw it
  // around smoothly, and double-clicking it maximizes (toggles fullscreen).
  // Only resizing needs JS, via the grips below.

  // --- resize (drag a grip) ---
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

  // Hover: reveal the chrome near the top-left, and keep the come-back buttons
  // clickable while click-through is on. Bound to both mouse + pointer move so
  // it works with the forwarded events we get during click-through.
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

  // Active resize drag.
  function onResizeMove(e) {
    if (!drag || !bridge) return;
    revealChrome();
    const MINW = 320,
      MINH = 240;
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
    if (width < MINW) {
      if (ed.includes("w")) x -= MINW - width;
      width = MINW;
    }
    if (height < MINH) {
      if (ed.includes("n")) y -= MINH - height;
      height = MINH;
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

  function setupControls() {
    el.btnThrough.addEventListener("click", () => bridge && bridge.setThrough(!throughOn));
    el.btnMode.addEventListener("click", toggleMode);
    el.btnPause.addEventListener("click", togglePause);
    el.btnQuit.addEventListener("click", () => bridge && bridge.quit());
    if (el.btnColor) el.btnColor.addEventListener("click", cycleTheme);

    // Resize grips (the rest of the surface is a native drag region).
    el.frame.querySelectorAll(".grip").forEach((g) => {
      g.addEventListener("pointerdown", (e) => beginResize(e, g.dataset.edge));
    });

    // Double-click the top-left (controls bar / reveal zone) to toggle
    // fullscreen. The drag surface itself is a native drag region, which
    // swallows dblclick, so we listen on these no-drag spots instead.
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

  setupControls();
  updatePauseIcon();
  applyTheme();
  refreshBounds();

  if (bridge) {
    bridge.onThrough((on) => {
      throughOn = on;
      document.body.classList.toggle("through", on);
      revealChrome();
      // Coupling: click-through implies you're working behind it -> ambient.
      setMode(on ? "ambient" : "play");
    });
    bridge.onToggleMode(toggleMode);
    bridge.onTogglePause(togglePause);
    bridge.onCycleTheme(cycleTheme);
    bridge.onFull(() => refreshBounds());
    bridge.onShortcuts((map) => {
      const pretty = (a) =>
        a
          ? a
              .replace("CommandOrControl", "^")
              .replace("Shift", "⇧")
              .replace("Alt", "⌥")
              .replace(/\+/g, "")
          : "(unbound)";
      const hints = document.getElementById("hints");
      if (hints) {
        hints.innerHTML =
          "<span><b>&larr; &rarr;</b> turn</span>" +
          "<span><b>&uarr;</b> thrust</span>" +
          "<span><b>SPACE</b> fire</span>" +
          "<span><b>drag</b> move</span>" +
          "<span><b>dbl-click</b> fullscreen</span>" +
          `<span><b>${pretty(map.through)}</b> through</span>` +
          `<span><b>${pretty(map.quit)}</b> quit</span>`;
      }
    });
  }

  // --- Boot ------------------------------------------------------------------
  setMode("play");
  updateHUD();
  requestAnimationFrame(loop);

  // Expose a tiny hook for automated testing / debugging.
  window.__pew = {
    state: () => ({
      displayMode,
      playState,
      paused,
      score,
      lives,
      level,
      asteroids: asteroids.length,
      bullets: bullets.length,
      particles: particles.length,
    }),
    startGame,
    setMode,
    fire,
    press: (name, v) => {
      keys[name] = v;
    },
    // chrome / window test hooks
    chromeHidden: () => chromeHidden,
    revealChrome,
    hideChromeNow: () => {
      hideAt = performance.now() - 1;
    },
    togglePause,
    toggleMode,
    popScore,
    cycleTheme,
    theme: () => ({ id: THEMES[themeIndex].id, ink, glow }),
  };
})();
