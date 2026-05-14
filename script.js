(() => {
  const WHOPPER_SRC = "whopper.png";

  const targetTimeEl = document.getElementById("targetTime");
  const offsetEl = document.getElementById("offsetMinutes");
  const randomBtn = document.getElementById("randomBtn");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const statusEl = document.getElementById("status");
  const countdownEl = document.getElementById("countdown");
  const metaEl = document.getElementById("meta");
  const overlay = document.getElementById("alertOverlay");
  const alertMessage = document.getElementById("alertMessage");
  const dismissBtn = document.getElementById("dismissBtn");
  const whopperStorm = document.getElementById("whopperStorm");
  const alarmAudio = document.getElementById("alarmAudio");
  const testBtn = document.getElementById("testBtn");

  let tickHandle = null;
  let alertFireTime = null;
  let targetDate = null;
  let offsetMinutes = 0;
  let fired = false;
  let whoppers = [];
  let stormFrameId = null;

  const pad = (n) => String(n).padStart(2, "0");

  function formatHMS(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  const formatClock = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  function nextOccurrence(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const now = new Date();
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }

  function setRandomTime() {
    const now = new Date();
    const offset = Math.floor(Math.random() * 59) + 2; // 2–60 min from now
    const target = new Date(now.getTime() + offset * 60 * 1000);
    targetTimeEl.value = `${pad(target.getHours())}:${pad(target.getMinutes())}`;
  }

  function playAlarm() {
    try {
      alarmAudio.muted = false;
      alarmAudio.volume = 1.0;
      alarmAudio.currentTime = 0;
      const p = alarmAudio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) {}
  }

  function stopAlarm() {
    try {
      alarmAudio.pause();
      alarmAudio.muted = true;
      alarmAudio.currentTime = 0;
    } catch (e) {}
  }

  // Browsers block audio.play() outside a user gesture. By starting the
  // audio muted on Start click, we satisfy autoplay policy now; when the
  // timer fires later (no gesture), unmuting is allowed.
  function primeAudio() {
    try {
      alarmAudio.muted = true;
      alarmAudio.volume = 0;
      alarmAudio.currentTime = 0;
      const p = alarmAudio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) {}
  }

  // kind: "slow" | "fast" — physics profile
  // tier: "ambient" | "alert" — whether dismissAlert should clean it up
  function spawnWhopper(kind, tier, w, h) {
    const wrap = document.createElement("div");
    wrap.className = "whopper";
    const img = document.createElement("img");
    img.src = WHOPPER_SRC;
    img.draggable = false;
    img.alt = "";
    wrap.appendChild(img);

    let size, vx, vy, vrot, gravity, chaos, chaosForce, cap, respawn;
    if (kind === "slow") {
      size = 130 + Math.random() * 110;
      vx = (Math.random() - 0.5) * 3;
      vy = 0.6 + Math.random() * 1.6;
      vrot = (Math.random() - 0.5) * 3;
      gravity = 0.04;
      chaos = 0.008;
      chaosForce = 2;
      cap = 6;
      respawn = true; // endless waterfall — wrap back to the top
    } else {
      size = 70 + Math.random() * 130;
      vx = (Math.random() - 0.5) * 16;
      vy = 4 + Math.random() * 10;
      vrot = (Math.random() - 0.5) * 22;
      gravity = 0.28;
      chaos = 0.07;
      chaosForce = 14;
      cap = 32;
      respawn = false; // bounce off the floor
    }

    wrap.style.width = size + "px";
    whopperStorm.appendChild(wrap);

    return {
      el: wrap, tier, kind, respawn,
      x: Math.random() * w,
      y: -size - Math.random() * h,
      vx, vy,
      rot: Math.random() * 360,
      vrot,
      size,
      gravity, chaos, chaosForce, cap,
    };
  }

  function ensureLoop() {
    if (stormFrameId) return;
    const step = () => {
      const maxX = window.innerWidth;
      const maxY = window.innerHeight;
      for (const wp of whoppers) {
        if (Math.random() < wp.chaos) {
          wp.vx += (Math.random() - 0.5) * wp.chaosForce;
          wp.vy += (Math.random() - 0.5) * wp.chaosForce;
          wp.vrot += (Math.random() - 0.5) * wp.chaosForce * 1.5;
        }
        wp.vy += wp.gravity;

        if (wp.vx >  wp.cap) wp.vx =  wp.cap;
        if (wp.vx < -wp.cap) wp.vx = -wp.cap;
        if (wp.vy >  wp.cap) wp.vy =  wp.cap;
        if (wp.vy < -wp.cap) wp.vy = -wp.cap;

        wp.x += wp.vx;
        wp.y += wp.vy;
        wp.rot += wp.vrot;

        if (wp.x < -wp.size) { wp.x = -wp.size; wp.vx =  Math.abs(wp.vx); wp.vrot = -wp.vrot; }
        if (wp.x > maxX)     { wp.x = maxX;     wp.vx = -Math.abs(wp.vx); wp.vrot = -wp.vrot; }
        if (wp.y > maxY) {
          if (wp.respawn) {
            // Continuous waterfall: teleport back above the screen with fresh entropy.
            wp.y = -wp.size - Math.random() * 200;
            wp.x = Math.random() * maxX;
            wp.vy = 0.6 + Math.random() * 1.6;
            wp.vx = (Math.random() - 0.5) * 3;
            wp.vrot = (Math.random() - 0.5) * 3;
          } else {
            wp.y = maxY;
            wp.vy = -Math.abs(wp.vy) * 0.7;
            wp.vx *= 0.85;
          }
        }

        wp.el.style.transform = `translate(${wp.x}px, ${wp.y}px) rotate(${wp.rot}deg)`;
      }
      stormFrameId = requestAnimationFrame(step);
    };
    step();
  }

  function startAmbient() {
    whopperStorm.hidden = false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const AMBIENT = 14; // big slow drifters always falling
    for (let i = 0; i < AMBIENT; i++) {
      whoppers.push(spawnWhopper("slow", "ambient", w, h));
    }
    ensureLoop();
  }

  function addAlertConfetti() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const FAST = 70;
    const EXTRA_SLOW = 55;
    for (let i = 0; i < FAST;       i++) whoppers.push(spawnWhopper("fast", "alert", w, h));
    for (let i = 0; i < EXTRA_SLOW; i++) whoppers.push(spawnWhopper("slow", "alert", w, h));
    ensureLoop();
  }

  function removeAlertConfetti() {
    whoppers = whoppers.filter((wp) => {
      if (wp.tier === "alert") { wp.el.remove(); return false; }
      return true;
    });
  }

  function fireAlert() {
    if (fired) return;
    fired = true;
    countdownEl.classList.add("fired");
    statusEl.textContent = "ALERT!";
    const targetStr = formatClock(targetDate);
    alertMessage.textContent = `${offsetMinutes} minute${offsetMinutes === 1 ? "" : "s"} until your target time (${targetStr}). Move it!`;
    overlay.hidden = false;
    playAlarm();
    addAlertConfetti();
  }

  function dismissAlert() {
    overlay.hidden = true;
    stopAlarm();
    removeAlertConfetti();
    countdownEl.classList.remove("fired");
  }

  function tick() {
    const now = Date.now();
    const msUntilTarget = targetDate.getTime() - now;
    const msUntilAlert = alertFireTime - now;

    if (!fired && msUntilAlert <= 0) fireAlert();

    if (msUntilTarget <= 0) {
      countdownEl.textContent = "00:00:00";
      statusEl.textContent = "Target time reached.";
      metaEl.textContent = `Target was ${formatClock(targetDate)}.`;
      stopTimer(false);
      return;
    }

    const showMs = fired ? msUntilTarget : msUntilAlert;
    countdownEl.textContent = formatHMS(showMs);

    if (!fired) {
      const warn = showMs <= 60 * 1000;
      countdownEl.classList.toggle("warning", warn);
      statusEl.textContent = warn ? "Almost there…" : "Counting down to alert";
      metaEl.textContent = `Target ${formatClock(targetDate)} · alert ${offsetMinutes}m before`;
    } else {
      statusEl.textContent = "ALERT — time until target";
      metaEl.textContent = `Target ${formatClock(targetDate)}`;
    }
  }

  function startTimer() {
    const t = targetTimeEl.value;
    if (!t) { statusEl.textContent = "Pick a target time first."; return; }
    const o = parseInt(offsetEl.value, 10);
    if (isNaN(o) || o < 0) { statusEl.textContent = "Offset must be 0 or more."; return; }

    targetDate = nextOccurrence(t);
    offsetMinutes = o;
    alertFireTime = targetDate.getTime() - offsetMinutes * 60 * 1000;
    fired = false;
    countdownEl.classList.remove("fired", "warning");
    overlay.hidden = true;
    stopAlarm();
    removeAlertConfetti();

    // Keep audio playing muted in the background so the eventual unmute
    // (from a non-gesture setInterval tick) is allowed by autoplay policy.
    primeAudio();

    if (alertFireTime <= Date.now()) fireAlert();

    if (tickHandle) clearInterval(tickHandle);
    tick();
    tickHandle = setInterval(tick, 250);

    startBtn.disabled = true;
    stopBtn.disabled = false;
    targetTimeEl.disabled = true;
    offsetEl.disabled = true;
    randomBtn.disabled = true;
  }

  function stopTimer(resetDisplay = true) {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    stopAlarm();
    removeAlertConfetti();
    overlay.hidden = true;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    targetTimeEl.disabled = false;
    offsetEl.disabled = false;
    randomBtn.disabled = false;
    if (resetDisplay) {
      countdownEl.textContent = "--:--:--";
      countdownEl.classList.remove("warning", "fired");
      statusEl.textContent = "Stopped.";
      metaEl.textContent = "";
    }
  }

  randomBtn.addEventListener("click", setRandomTime);
  startBtn.addEventListener("click", startTimer);
  stopBtn.addEventListener("click", () => stopTimer(true));
  dismissBtn.addEventListener("click", dismissAlert);

  if (new URLSearchParams(window.location.search).get("dev") === "true") {
    testBtn.hidden = false;
    testBtn.addEventListener("click", () => {
      statusEl.textContent = "TEST MODE";
      alertMessage.textContent = "Dev test — bracing for impact.";
      overlay.hidden = false;
      playAlarm();
      addAlertConfetti();
    });
  }

  (function initDefault() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5 - (now.getMinutes() % 5), 0, 0);
    targetTimeEl.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  })();

  // Ambient burger rain starts immediately on page load.
  startAmbient();
})();
