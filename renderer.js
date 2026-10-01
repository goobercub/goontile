'use strict';

const grid = document.getElementById('grid');

// instanceId → { tile, video, item }
const registry = new Map();

let cfg = { skipSeconds: 5, muted: false, volume: 100, normalizeAudio: true, limiter: true };
let paused = false;
let muted = false;
let mutedInitialized = false;
let duckFactor = 1; // video-tile volume multiplier (lowered while an affirmation plays)

window.tiler.onDuck(({ factor }) => {
  duckFactor = (typeof factor === 'number') ? factor : 1;
  // Ducking rides on the element volume, which feeds the Web Audio graph; tiles
  // without a graph fold the tile/master volumes in here too.
  for (const entry of registry.values()) {
    if (entry.audio) { try { entry.video.volume = duckFactor; } catch (_) {} }
    else applyFallbackVolume(entry);
  }
});

window.tiler.onVolume(({ volume }) => setMasterVolume(volume, false));

window.tiler.onPlayerConfig((c) => {
  cfg = { ...cfg, ...c };
  for (const entry of registry.values()) applyControlDensity(entry.tile);
  setMasterVolume(cfg.volume, false);
  applyWallDrift();
  applyEdgeInserts();
  for (const entry of registry.values()) applyAudioSettings(entry);
});

// Solo and pan are both tied to the window size.
window.addEventListener('resize', () => {
  const solo = soloId != null ? registry.get(soloId) : null;
  if (solo) placeTile(solo.tile, 0, 0, window.innerWidth, window.innerHeight);
  for (const entry of registry.values()) updatePan(entry);
});

// Replace one tile's video without touching the layout: hold the rectangle,
// fade the picture out, load the next clip, fade back in.
window.tiler.onSwapTile(({ instanceId, path, kind, folder, folderLabel, prefLevel }) => {
  const entry = registry.get(instanceId);
  if (!entry) return;
  const { tile, video } = entry;
  const nowImage = kind === 'image';
  // A still and a clip need different elements, so a swap across kinds has to
  // rebuild the tile rather than just repoint the source.
  if (nowImage !== entry.isImage) {
    rebuildTile(entry, { ...entry.cell, path, kind, folder, folderLabel, prefLevel });
    return;
  }
  entry.cell = { ...entry.cell, path, kind, folder, folderLabel, prefLevel };
  entry.crop.x = 50; entry.crop.y = 50;
  video.style.objectPosition = '50% 50%';
  entry.setFolder(entry.cell);

  tile.classList.add('swapping');
  // Token so a later swap's timers can't cut this one's fade short.
  const token = (entry.swapToken || 0) + 1;
  entry.swapToken = token;
  const readyEvent = entry.isImage ? 'load' : 'loadeddata';
  const start = () => {
    video.removeEventListener(readyEvent, start);
    if (entry.swapToken !== token) return;
    tile.classList.remove('swapping');
    if (entry.isImage) startImageHold(entry);
    else if (!paused) video.play().catch(() => {});
  };
  video.addEventListener(readyEvent, start);
  setTimeout(() => {
    if (entry.swapToken !== token) return;
    if (entry.isImage) stopImageHold(entry); else video.loop = false;
    video.src = pathToFileUrl(path);
    if (!entry.isImage) { try { video.load(); } catch (_) {} }
    // Safety net: if it never signals ready, don't leave the tile faded out.
    setTimeout(start, 4000);
  }, 260);
});

window.tiler.onPrefResult(({ folder, level, preferred, avoided }) => {
  const name = String(folder || '').replace(/\\/g, '/').split('/').pop() || 'folder';
  if (level > 0) flashHud(`${name} first — ${preferred} clip${preferred === 1 ? '' : 's'} moved up`);
  else if (level < 0) flashHud(`${name} to the back — ${avoided} clip${avoided === 1 ? '' : 's'} moved`);
  else flashHud(`${name} back to normal`);
});

window.tiler.onPrefLevels((levels) => {
  for (const { instanceId, prefLevel } of levels || []) {
    const entry = registry.get(instanceId);
    if (!entry) continue;
    entry.cell.prefLevel = prefLevel;
    entry.setFolder(entry.cell);
  }
});

window.tiler.onPreviousResult(({ found }) => {
  flashHud(found ? 'Previous' : 'No previous clip');
});

window.tiler.onClimaxRecorded(({ added, total }) => {
  flashHud(added ? `O logged · +${added} · total ${total}` : 'No videos to count');
});

// Forward renderer errors to the debug log
window.addEventListener('error', (e) => rlog(`window.error: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => rlog(`unhandledrejection: ${e.reason && e.reason.message ? e.reason.message : e.reason}`));
function rlog(msg) { try { window.tiler.log(msg); } catch (_) {} }

window.tiler.onApplyLayout(({ cells, config }) => {
  if (config) {
    cfg = { ...cfg, ...config };
    // Only the first layout seeds the mute state; after that the M key owns it.
    if (!mutedInitialized) {
      muted = !!config.muted;
      mutedInitialized = true;
    }
    setMasterVolume(cfg.volume, false);
    applyLimiterSettings();
    applyWallDrift();
    applyEdgeInserts();
  }
  applyLayout(cells);
});

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'Escape':
      // Escape backs out of a solo'd tile before it quits the app.
      if (soloId != null) { toggleSolo(registry.get(soloId)); break; }
      window.tiler.quit();
      break;
    case 'q':
    case 'Q':
      window.tiler.quit();
      break;
    case 'n':
    case 'N':
    case 'ArrowRight':
      flashHud('Next');
      window.tiler.forceNext();
      break;
    case ' ':
      e.preventDefault();
      togglePause();
      break;
    case 'm':
    case 'M':
      toggleMute();
      break;
    case 'ArrowUp':
      e.preventDefault();
      nudgeVolume(5);
      break;
    case 'ArrowDown':
      e.preventDefault();
      nudgeVolume(-5);
      break;
    case 'r':
    case 'R':
      flashHud('Reshuffle');
      window.tiler.reshuffle();
      break;
    case 'c':
    case 'C':
      window.tiler.openControls();
      break;
    case 'v':
    case 'V':
      window.tiler.rhythmToggle();
      break;
    case 't':
    case 'T':
      window.tiler.tapTempo();
      flashHud('Tap');
      break;
    case 'h':
    case 'H':
      window.tiler.hypnoToggle();
      break;
    case 'p':
    case 'P':
      window.tiler.hypnoCycle();
      break;
    case 'x':
    case 'X':
      window.tiler.textToggle();
      break;
    case 'o':
    case 'O':
      if (e.repeat) break;
      window.tiler.markClimax();
      break;
    default:
      break;
  }
});

// The edge insert strips can be turned off entirely for a clean wall.
function applyEdgeInserts() {
  document.body.classList.toggle('no-edge-inserts', cfg.edgeInserts === false);
}

// Edge buttons: insert a video (any size or vertical) on the left / right
document.querySelectorAll('.ins').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const side = btn.dataset.side;
    const kind = btn.dataset.kind;
    flashHud(kind === 'vertical' ? 'Insert ▮' : 'Insert ▭');
    window.tiler.insertVideo(side, kind);
  });
});

// Hide the cursor (and hover controls) after a few seconds of inactivity.
let idleTimer = null;
function markActive() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
}
document.addEventListener('mousemove', markActive);
markActive();

window.tiler.rendererReady();
rlog('renderer loaded');

// ── Breathing exercise ──────────────────────────────────────────────────────

const breathEl = document.getElementById('breathing');
const breathCircle = breathEl ? breathEl.querySelector('.circle') : null;
const breathRingProg = breathEl ? breathEl.querySelector('.br-prog') : null;
const breathPhaseEl = breathEl ? breathEl.querySelector('.phase') : null;
const breathCountEl = breathEl ? breathEl.querySelector('.count') : null;
const breathCountdownEl = document.getElementById('breath-countdown');
const breathProgEl = breathCountdownEl ? breathCountdownEl.querySelector('.bc-prog') : null;
const breathLabelEl = breathCountdownEl ? breathCountdownEl.querySelector('.bc-label') : null;
const breathImgBack = breathCountdownEl ? breathCountdownEl.querySelector('.bc-img-back') : null;
const breathImgFront = breathCountdownEl ? breathCountdownEl.querySelector('.bc-img-front') : null;
const breathSkipBtn = document.getElementById('breathSkip');
const RING_C = 276.46; // 2π·44, matches the SVG radius

let breathNextAt = 0;
let breathIntervalMs = 0;
let breathImageSrc = '';
let cdX = -1, cdY = -1, cdH = 220; // countdown image position/size (-1 = default bottom-left)
let ringRAF = null;
let breathVisible = false;
let breathSeqId = 0;
let abortPhase = null;
let audioCtx = null;

function fmtClock(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ── Tile audio: master volume, auto-leveling, limiter ────────────────────────
//
// Every tile's <video> is routed through Web Audio:
//   source → norm (auto-level) → tileGain (per-tile) → master → limiter → out
// The auto-level stage watches each clip's short-term RMS and trims it toward a
// common loudness, so a blaring clip and a quiet one sit at the same level; the
// limiter downstream catches the peaks that boosting creates.

const LOUDNESS_FLOOR = 0.004;   // below this the clip is silence, not quiet
const PEAK_CEILING = 0.85;      // a boosted clip's peaks may not go past this
const PEAK_DECAY = 0.9;         // how fast the peak-hold falls between samples
const NORM_MIN = 0.25, NORM_MAX = 3;

let masterGain = null;
let limiterNode = null;
let softClipNode = null;
let normTimer = null;

// RMS the auto-leveler aims each tile at. Lower target = more headroom.
function loudnessTarget() {
  const pct = cfg.normalizeTarget == null ? 40 : Math.max(0, Math.min(100, cfg.normalizeTarget));
  return 0.035 + (pct / 100) * 0.105; // 0.035 (quiet) .. 0.14 (hot)
}

// A gentle tanh curve as the last thing before the speakers. It is transparent
// at normal levels and rounds off anything that would otherwise clip, so a
// boosted tile (or several summing together) can never hard-clip the output.
function softClipCurve() {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = 1.3;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return curve;
}

function ensureAudioGraph() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) { return null; }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  if (!masterGain) {
    masterGain = audioCtx.createGain();
    masterGain.gain.value = (cfg.volume == null ? 100 : cfg.volume) / 100;
    limiterNode = audioCtx.createDynamicsCompressor();
    limiterNode.knee.value = 0;
    limiterNode.attack.value = 0.001; // catch transients, not just sustained peaks
    limiterNode.release.value = 0.12;
    applyLimiterSettings();
    softClipNode = audioCtx.createWaveShaper();
    softClipNode.curve = softClipCurve();
    softClipNode.oversample = '2x';
    masterGain.connect(limiterNode);
    limiterNode.connect(softClipNode);
    softClipNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

function applyLimiterSettings() {
  if (!limiterNode) return;
  // "Off" leaves the node in the chain but transparent (1:1 above 0 dBFS).
  const on = cfg.limiter !== false;
  limiterNode.threshold.value = on ? -3 : 0;
  limiterNode.ratio.value = on ? 20 : 1;
}

// Browsers only allow one MediaElementSource per element, so cache it.
function attachTileAudio(entry) {
  const ctx = ensureAudioGraph();
  if (!ctx) return;
  try {
    const source = ctx.createMediaElementSource(entry.video);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const norm = ctx.createGain();
    const tileGain = ctx.createGain();
    tileGain.gain.value = entry.tileVolume;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    source.connect(analyser);
    source.connect(norm);
    norm.connect(tileGain);
    if (panner) { tileGain.connect(panner); panner.connect(masterGain); }
    else tileGain.connect(masterGain);
    entry.audio = { source, analyser, norm, tileGain, panner, buf: new Float32Array(analyser.fftSize), level: 0 };
    updatePan(entry);
    startNormalizer();
  } catch (e) {
    rlog(`tile audio unavailable: ${e.message}`);
  }
}

function applyAudioSettings(entry) {
  applyLimiterSettings();
  applyKenBurns(entry);
  if (!entry.audio) return;
  entry.audio.tileGain.gain.value = entry.tileVolume;
  if (cfg.normalizeAudio === false) {
    entry.audio.norm.gain.setTargetAtTime(1, audioCtx.currentTime, 0.15);
  }
  updatePan(entry);
}

// Pan each tile by where it sits on the wall: hard left at the left edge, hard
// right at the right. A solo'd tile fills the screen, so it re-centres itself.
function updatePan(entry) {
  const p = entry.audio && entry.audio.panner;
  if (!p || !entry.rect) return;
  const amount = cfg.stereoPan ? Math.max(0, Math.min(100, cfg.stereoPanAmount || 0)) / 100 : 0;
  const width = window.innerWidth || 1;
  const centre = (entry.rect.x + entry.rect.w / 2) / width;
  const value = soloId === entry.cell.instanceId ? 0 : (centre * 2 - 1) * amount;
  p.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), audioCtx.currentTime, 0.1);
}

// ── Drift (Ken Burns) ────────────────────────────────────────────────────────
//
// The same slow zoom/pan drives either each tile individually or the whole wall
// as one image, depending on the scope setting.

function driftScope() {
  return cfg.kenBurnsScope === 'wall' ? 'wall' : 'tile';
}

// Point the zoom pulls toward. 'crop' follows wherever the tile was reframed to,
// 'center' is the middle, 'random' picks a spot (and adds a pan).
function driftFocus(crop) {
  const mode = cfg.kenBurnsCenter || 'random';
  if (mode === 'crop' && crop) return { x: crop.x, y: crop.y, pan: false };
  if (mode === 'center') return { x: 50, y: 50, pan: false };
  return { x: 25 + Math.random() * 50, y: 25 + Math.random() * 50, pan: true };
}

// How long one sweep takes. Beat-synced, that is a whole number of beats off the
// shared tempo clock, so the drift breathes with the music.
function driftSeconds() {
  if (cfg.kenBurnsBeatSync && tempoBpm > 0) {
    const beats = Math.max(1, Math.min(64, cfg.kenBurnsBeats || 16));
    return (beats * 60) / tempoBpm;
  }
  return Math.max(5, Math.min(600, cfg.kenBurnsSeconds || 30));
}

// Rotating a crop-to-fill video uncovers the corners of its box unless it is
// zoomed enough to hide them. This is the smallest scale that still covers, for
// a given angle and box shape.
function rotationCoverScale(deg, w, h) {
  if (!deg || !w || !h) return 1;
  const r = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.cos(r);
  const sn = Math.sin(r);
  return Math.max((w * c + h * sn) / w, (w * sn + h * c) / h);
}

function setDriftVars(el, { crop, jitter, box }) {
  const amount = Math.max(1, Math.min(40, cfg.kenBurnsAmount || 6)) / 100;
  const rotate = Math.max(0, Math.min(10, cfg.kenBurnsRotate || 0));
  const synced = cfg.kenBurnsBeatSync && tempoBpm > 0;
  const base = driftSeconds();
  // Free-running tiles get a spread of periods so they never sweep in lockstep.
  // Synced ones keep the exact period — they are staggered by whole beats below
  // instead, which keeps them apart without drifting off the grid.
  const seconds = (jitter && !synced) ? base * (0.75 + Math.random() * 0.5) : base;
  const focus = driftFocus(crop);
  const sign = () => (Math.random() < 0.5 ? -1 : 1);

  // The sway runs from -angle to +angle, so it passes through level halfway.
  const swing = rotate * sign();
  const cover = rotationCoverScale(rotate, box ? box.w : 16, box ? box.h : 9);

  el.style.setProperty('--kb-scale0', cover.toFixed(4));
  el.style.setProperty('--kb-scale', (cover + amount).toFixed(4));
  el.style.setProperty('--kb-x', focus.pan ? `${sign() * amount * 40}%` : '0%');
  el.style.setProperty('--kb-y', focus.pan ? `${sign() * amount * 40}%` : '0%');
  el.style.setProperty('--kb-rot-from', `${(-swing).toFixed(2)}deg`);
  el.style.setProperty('--kb-rot', `${swing.toFixed(2)}deg`);
  el.style.setProperty('--kb-origin', `${focus.x.toFixed(1)}% ${focus.y.toFixed(1)}%`);
  el.style.setProperty('--kb-dur', `${seconds.toFixed(3)}s`);

  // `alternate` means the visual cycle is two sweeps long. A negative delay
  // starts the animation partway in: synced, that offset is measured from the
  // tempo clock so every tile lands on the same beat grid.
  const cycle = seconds * 2;
  let offset;
  if (synced) {
    const beatSeconds = 60 / tempoBpm;
    const stagger = jitter ? Math.floor(Math.random() * Math.max(1, cfg.kenBurnsBeats || 16)) * beatSeconds : 0;
    const elapsed = (Date.now() - tempoT0) / 1000;
    offset = (((elapsed + stagger) % cycle) + cycle) % cycle;
  } else {
    offset = jitter ? Math.random() * cycle : 0;
  }
  el.style.animationDelay = `${(-offset).toFixed(3)}s`;

  // Restart cleanly so the new duration and delay take effect from scratch.
  el.classList.remove('kb');
  void el.offsetWidth; // force reflow
  el.classList.add('kb');
}

function clearDrift(el) {
  el.classList.remove('kb');
}

function applyKenBurns(entry) {
  const v = entry.video;
  if (!cfg.kenBurns || driftScope() === 'wall') {
    clearDrift(v);
    return;
  }
  setDriftVars(v, { crop: entry.crop, jitter: true, box: entry.rect });
}

// One drift across the entire wall: the tile container itself is the thing that
// moves, so every tile slides and zooms together as one picture.
function applyWallDrift() {
  if (!cfg.kenBurns || driftScope() !== 'wall') {
    clearDrift(grid);
    return;
  }
  setDriftVars(grid, {
    jitter: false,
    box: { w: window.innerWidth, h: window.innerHeight },
  });
}

function refreshAllDrift() {
  applyWallDrift();
  for (const entry of registry.values()) applyKenBurns(entry);
}

// Reframing a tile moves the focal point when the drift is set to follow it.
function refreshDriftFocus(entry) {
  if (!cfg.kenBurns || driftScope() === 'wall') return;
  if ((cfg.kenBurnsCenter || 'random') !== 'crop') return;
  entry.video.style.setProperty('--kb-origin', `${entry.crop.x}% ${entry.crop.y}%`);
}

// Follow each tile's loudness and ease its gain toward the shared target.
// Follow each tile's loudness AND its peaks, and ease its gain toward the shared
// target. Aiming at loudness alone is what made quiet-but-punchy clips clip: a
// low average asks for a big boost, and the peaks come along for the ride. The
// peak-hold below puts a hard ceiling on the boost, so a clip is only lifted as
// far as its own headroom allows.
function normalizeStep() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const target = loudnessTarget();
  for (const entry of registry.values()) {
    const a = entry.audio;
    if (!a || entry.isImage || entry.isWebcam) continue;
    if (cfg.normalizeAudio === false) continue;
    if (entry.video.paused) continue;

    a.analyser.getFloatTimeDomainData(a.buf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < a.buf.length; i++) {
      const v = a.buf[i];
      sum += v * v;
      const av = v < 0 ? -v : v;
      if (av > peak) peak = av;
    }
    const rms = Math.sqrt(sum / a.buf.length);

    // Peak-hold decays slowly so one loud transient keeps the gain down for a
    // while rather than for a single 200ms window.
    a.peak = Math.max(peak, (a.peak || 0) * PEAK_DECAY);
    if (rms < LOUDNESS_FLOOR) continue; // don't crank the gain during silence

    // Track the loud parts quickly, let quiet stretches decay the estimate slowly.
    a.level = a.level === 0 ? rms : a.level + (rms - a.level) * (rms > a.level ? 0.4 : 0.03);

    const byLoudness = target / a.level;
    const byHeadroom = PEAK_CEILING / Math.max(a.peak, 0.02);
    const want = Math.min(NORM_MAX, Math.max(NORM_MIN, Math.min(byLoudness, byHeadroom)));

    // Duck fast, lift slowly — the reverse would pump audibly on every transient.
    const current = a.norm.gain.value;
    a.norm.gain.setTargetAtTime(want, now, want < current ? 0.05 : 1.2);
  }
}

function startNormalizer() {
  if (normTimer == null) normTimer = setInterval(normalizeStep, 200);
}

function setMasterVolume(volume, persist) {
  const v = Math.max(0, Math.min(100, Math.round(volume == null ? 100 : volume)));
  cfg.volume = v;
  if (masterGain) masterGain.gain.setTargetAtTime(v / 100, audioCtx.currentTime, 0.05);
  // Tiles whose Web Audio route failed still respond to the element volume.
  for (const entry of registry.values()) if (!entry.audio) applyFallbackVolume(entry);
  if (persist) window.tiler.setVolume(v);
}

function applyFallbackVolume(entry) {
  try {
    entry.video.volume = Math.max(0, Math.min(1, duckFactor * entry.tileVolume * (cfg.volume / 100)));
  } catch (_) {}
}

function nudgeVolume(delta) {
  setMasterVolume((cfg.volume == null ? 100 : cfg.volume) + delta, true);
  flashHud(`Volume ${cfg.volume}%`);
}

// An AudioContext can start suspended; any interaction is a chance to resume it.
for (const ev of ['pointerdown', 'keydown']) {
  document.addEventListener(ev, () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }, true);
}

function tone(freq, dur, gainVal) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gainVal, now + 0.06);
    g.gain.linearRampToValueAtTime(0, now + dur);
    o.start(now);
    o.stop(now + dur + 0.05);
  } catch (_) {}
}

function breathTone(phase, sound) {
  if (!sound) return;
  if (phase === 'inhale') tone(392, 0.5, 0.06);
  else if (phase === 'exhale') tone(262, 0.6, 0.06);
  else tone(330, 0.25, 0.045);
}

// Drive the countdown ring with rAF so the circumference fills smoothly.
function ringStep() {
  if (!breathCountdownEl) return;
  if (breathVisible || !breathNextAt || !breathIntervalMs) {
    breathCountdownEl.style.display = 'none';
    ringRAF = requestAnimationFrame(ringStep);
    return;
  }
  const now = Date.now();
  const start = breathNextAt - breathIntervalMs;
  const frac = Math.min(1, Math.max(0, (now - start) / breathIntervalMs));
  if (breathImageSrc) {
    // Reveal the full-opacity copy from the bottom up as the countdown fills.
    if (breathImgFront) breathImgFront.style.clipPath = `inset(${(1 - frac) * 100}% 0 0 0)`;
  } else {
    if (breathProgEl) breathProgEl.style.strokeDashoffset = String(RING_C * (1 - frac));
    if (breathLabelEl) breathLabelEl.textContent = fmtClock((breathNextAt - now) / 1000);
  }
  breathCountdownEl.style.display = 'flex';
  ringRAF = requestAnimationFrame(ringStep);
}
function startRing() {
  if (ringRAF == null) ringRAF = requestAnimationFrame(ringStep);
}
function stopRing() {
  if (ringRAF != null) { cancelAnimationFrame(ringRAF); ringRAF = null; }
  if (breathCountdownEl) breathCountdownEl.style.display = 'none';
}

window.tiler.onBreathingSchedule(({ nextAt, intervalMs, image, cdx, cdy, cdh }) => {
  breathNextAt = nextAt;
  breathIntervalMs = intervalMs || breathIntervalMs;
  if (typeof cdx === 'number') cdX = cdx;
  if (typeof cdy === 'number') cdY = cdy;
  if (typeof cdh === 'number') cdH = cdh;
  const img = image || '';
  if (img !== breathImageSrc) {
    breathImageSrc = img;
    if (img) {
      const url = pathToFileUrl(img);
      if (breathImgBack) breathImgBack.src = url;
      if (breathImgFront) breathImgFront.src = url;
      breathCountdownEl.classList.add('image-mode');
    } else {
      breathCountdownEl.classList.remove('image-mode');
      breathCountdownEl.style.left = ''; breathCountdownEl.style.top = '';
      breathCountdownEl.style.height = ''; breathCountdownEl.style.transform = '';
    }
  }
  if (breathImageSrc) applyCountdownLayout();
  startRing();
});

window.tiler.onCountdownPos(({ x, y, height }) => {
  cdX = x; cdY = y; cdH = height;
  if (breathImageSrc) applyCountdownLayout();
});

// Position/size the countdown image (default bottom-left, clamped to the window).
function applyCountdownLayout() {
  const margin = 24;
  breathCountdownEl.style.transform = 'none';
  breathCountdownEl.style.height = cdH + 'px';
  const wEl = breathCountdownEl.offsetWidth || cdH;
  let x = cdX, y = cdY;
  if (x < 0 || y < 0) { x = margin; y = window.innerHeight - cdH - margin; }
  x = Math.min(Math.max(0, x), Math.max(0, window.innerWidth - wEl));
  y = Math.min(Math.max(0, y), Math.max(0, window.innerHeight - cdH));
  breathCountdownEl.style.left = x + 'px';
  breathCountdownEl.style.top = y + 'px';
}

let cdSaveTimer = null;
function saveCountdown() {
  clearTimeout(cdSaveTimer);
  cdSaveTimer = setTimeout(() => {
    const x = parseFloat(breathCountdownEl.style.left) || 0;
    const y = parseFloat(breathCountdownEl.style.top) || 0;
    window.tiler.countdownSet(x, y, cdH);
  }, 200);
}

window.tiler.onBreathingStart((p) => { runBreathing(p); });
window.tiler.onBreathingEnd(() => { stopBreathing(); });
if (breathSkipBtn) breathSkipBtn.addEventListener('click', () => window.tiler.breathingSkip());

// Click = start now; drag = move (image mode); wheel = resize (image mode).
let cdDown = false, cdMoved = false, cdStartX = 0, cdStartY = 0, cdOrigX = 0, cdOrigY = 0;
if (breathCountdownEl) {
  breathCountdownEl.addEventListener('pointerdown', (e) => {
    cdDown = true; cdMoved = false;
    cdStartX = e.clientX; cdStartY = e.clientY;
    cdOrigX = parseFloat(breathCountdownEl.style.left) || 0;
    cdOrigY = parseFloat(breathCountdownEl.style.top) || 0;
    try { breathCountdownEl.setPointerCapture(e.pointerId); } catch (_) {}
  });
  breathCountdownEl.addEventListener('pointermove', (e) => {
    if (!cdDown || !breathImageSrc) return;
    const dx = e.clientX - cdStartX, dy = e.clientY - cdStartY;
    if (Math.abs(dx) + Math.abs(dy) > 4) cdMoved = true;
    if (cdMoved) { cdX = cdOrigX + dx; cdY = cdOrigY + dy; applyCountdownLayout(); }
  });
  breathCountdownEl.addEventListener('pointerup', (e) => {
    try { breathCountdownEl.releasePointerCapture(e.pointerId); } catch (_) {}
    if (!cdDown) return;
    cdDown = false;
    if (cdMoved && breathImageSrc) saveCountdown();
    else if (!breathImageSrc) window.tiler.breathingNow(); // ring: single click starts
  });
  // Image mode is a draggable widget — start on double-click so clicks/drags don't trigger it.
  breathCountdownEl.addEventListener('dblclick', () => {
    if (breathImageSrc) window.tiler.breathingNow();
  });
  breathCountdownEl.addEventListener('wheel', (e) => {
    if (!breathImageSrc) return;
    e.preventDefault();
    cdH = Math.min(window.innerHeight * 0.9, Math.max(60, cdH * (e.deltaY < 0 ? 1.08 : 0.92)));
    applyCountdownLayout();
    saveCountdown();
  }, { passive: false });
}
window.addEventListener('resize', () => { if (breathImageSrc) applyCountdownLayout(); });

function showBreathing() {
  breathVisible = true;
  stopRing();
  resetRingFill();
  if (breathEl) breathEl.classList.add('show');
}
function stopBreathing() {
  breathSeqId++; // invalidate any running sequence
  if (abortPhase) abortPhase();
  breathVisible = false;
  if (breathEl) breathEl.classList.remove('show');
  // The ring resumes when main broadcasts the next schedule.
}

// Fill the ring around the breathing circle over the phase duration (linear =
// real elapsed time, matching the countdown ring).
function setRingFill(durSec) {
  if (!breathRingProg) return;
  breathRingProg.style.transition = 'none';
  breathRingProg.style.strokeDashoffset = String(RING_C);
  void breathRingProg.getBoundingClientRect(); // flush so the next change animates
  breathRingProg.style.transition = `stroke-dashoffset ${durSec}s linear`;
  breathRingProg.style.strokeDashoffset = '0';
}
function resetRingFill() {
  if (!breathRingProg) return;
  breathRingProg.style.transition = 'none';
  breathRingProg.style.strokeDashoffset = String(RING_C);
}

function setCircleScale(scale, durSec) {
  if (!breathCircle) return;
  breathCircle.style.transitionDuration = `${durSec}s`;
  // Force reflow so consecutive scale changes animate from the current value.
  void breathCircle.offsetWidth;
  breathCircle.style.transform = `scale(${scale})`;
}

function phaseWait(durSec) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { abortPhase = null; resolve(); }, durSec * 1000);
    abortPhase = () => { clearTimeout(t); abortPhase = null; resolve(); };
  });
}

async function runBreathing(p) {
  const myId = ++breathSeqId;
  showBreathing();
  for (let b = 1; b <= p.breaths; b++) {
    if (myId !== breathSeqId) return;
    if (breathCountEl) breathCountEl.textContent = `Breath ${b} of ${p.breaths}`;

    if (p.inhale > 0) {
      if (breathPhaseEl) breathPhaseEl.textContent = 'Breathe In';
      breathTone('inhale', p.sound);
      setCircleScale(1, p.inhale);
      setRingFill(p.inhale);
      await phaseWait(p.inhale);
      if (myId !== breathSeqId) return;
    }
    if (p.hold > 0) {
      if (breathPhaseEl) breathPhaseEl.textContent = 'Hold';
      breathTone('hold', p.sound);
      setRingFill(p.hold);
      await phaseWait(p.hold);
      if (myId !== breathSeqId) return;
    }
    if (p.exhale > 0) {
      if (breathPhaseEl) breathPhaseEl.textContent = 'Breathe Out';
      breathTone('exhale', p.sound);
      setCircleScale(0.4, p.exhale);
      setRingFill(p.exhale);
      await phaseWait(p.exhale);
      if (myId !== breathSeqId) return;
    }
    if (p.holdAfter > 0) {
      if (breathPhaseEl) breathPhaseEl.textContent = 'Hold';
      breathTone('hold', p.sound);
      setRingFill(p.holdAfter);
      await phaseWait(p.holdAfter);
      if (myId !== breathSeqId) return;
    }
  }
  // main broadcasts 'breathing-end' shortly after; the overlay hides then.
}

// ── Rhythm indicator (tempo) ────────────────────────────────────────────────

const rhythmEl = document.getElementById('rhythm');
const rhythmBob = rhythmEl ? rhythmEl.querySelector('.bob') : null;
const rhythmDot = rhythmEl ? rhythmEl.querySelector('.dot') : null;
const rhythmBpmEl = rhythmEl ? rhythmEl.querySelector('.bpm') : null;

let tempoBpm = 60;
let tempoT0 = Date.now();
let rhythmOn = false;
let rhythmRAF = null;
let rhythmTravel = 0;
const BEATS_PER_CYCLE = 2; // one full up-down bob per 2 beats

window.tiler.onTempo(({ bpm, t0 }) => {
  tempoBpm = bpm;
  tempoT0 = t0;
  if (cfg.kenBurns && cfg.kenBurnsBeatSync) refreshAllDrift();
});
window.tiler.onRhythm(({ show }) => { show ? showRhythm() : hideRhythm(); });

function showRhythm() {
  rhythmOn = true;
  if (rhythmEl) rhythmEl.classList.add('show');
  if (rhythmBob && rhythmDot) rhythmTravel = Math.max(0, rhythmBob.clientHeight - rhythmDot.offsetHeight);
  if (rhythmRAF == null) rhythmRAF = requestAnimationFrame(drawRhythm);
}
function hideRhythm() {
  rhythmOn = false;
  if (rhythmEl) rhythmEl.classList.remove('show');
  if (rhythmRAF != null) { cancelAnimationFrame(rhythmRAF); rhythmRAF = null; }
}

function drawRhythm() {
  if (!rhythmOn) { rhythmRAF = null; return; }
  // Beat phase from the shared tempo clock → smooth vertical bob.
  const beats = (Date.now() - tempoT0) * tempoBpm / 60000;
  const phase = (beats / BEATS_PER_CYCLE) * Math.PI * 2;
  const t = (1 - Math.cos(phase)) / 2; // 0 at top, 1 at bottom, eased ends
  if (rhythmDot) rhythmDot.style.transform = `translateY(${t * rhythmTravel}px)`;
  if (rhythmBpmEl) rhythmBpmEl.textContent = `${Math.round(tempoBpm)}`;
  rhythmRAF = requestAnimationFrame(drawRhythm);
}

// ── Meditation goal timer ───────────────────────────────────────────────────

const goalEl = document.getElementById('goal');
const goalReadoutEl = goalEl ? goalEl.querySelector('.goal-readout') : null;
const goalCountdownEl = goalEl ? goalEl.querySelector('.goal-countdown') : null;

let goalEnabled = false;
let goalCountdownOn = false;
let goalStart = 0;
let goalTarget = 0;
let goalTargetIsGoal = false;
let goalTickTimer = null;
let goalBeatNotified = false;

window.tiler.onGoal(({ enabled, countdown, start, target, targetIsGoal }) => {
  goalEnabled = !!enabled;
  goalCountdownOn = !!countdown;
  goalStart = start || Date.now();
  goalTarget = target || 0;
  goalTargetIsGoal = !!targetIsGoal;
  goalBeatNotified = false;
  if (goalEnabled) { if (goalEl) goalEl.classList.add('show'); startGoalTick(); }
  else { if (goalEl) goalEl.classList.remove('show'); stopGoalTick(); }
});

function fmtMMSS(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function startGoalTick() { stopGoalTick(); goalTick(); goalTickTimer = setInterval(goalTick, 250); }
function stopGoalTick() { if (goalTickTimer) { clearInterval(goalTickTimer); goalTickTimer = null; } }

function goalTick() {
  if (!goalEnabled || !goalReadoutEl) return;
  const elapsed = (Date.now() - goalStart) / 1000;
  const reached = goalTarget > 0 && elapsed >= goalTarget;
  const label = goalTargetIsGoal ? 'goal' : 'best';
  const tail = goalTarget > 0
    ? ` <span class="best">${label} ${fmtMMSS((reached && !goalTargetIsGoal) ? elapsed : goalTarget)}</span>`
    : '';
  goalReadoutEl.innerHTML = `⏱ ${fmtMMSS(elapsed)}${tail}`;
  goalReadoutEl.classList.toggle('beat', reached);

  if (reached && !goalBeatNotified) {
    goalBeatNotified = true;
    flashHud(goalTargetIsGoal ? '✓ Goal reached' : '★ New best');
  }

  const remain = goalTarget - elapsed;
  if (goalCountdownOn && goalTarget > 0 && remain > 0 && remain <= 10) {
    goalCountdownEl.textContent = String(Math.ceil(remain));
    goalCountdownEl.classList.add('show');
  } else {
    goalCountdownEl.classList.remove('show');
  }
}

// ── Hypnosis pattern layer (grayscale video, multiply blend) ────────────────

const hypnoEl = document.getElementById('hypno');
const hypnoVideo = document.getElementById('hypnoVideo');
let hypnoSrc = '';

window.tiler.onHypno(({ show, src, opacity }) => {
  if (typeof opacity === 'number' && hypnoVideo) {
    hypnoVideo.style.opacity = String(Math.min(1, Math.max(0, opacity / 100)));
  }
  if (show) {
    if (src && src !== hypnoSrc && hypnoVideo) {
      hypnoSrc = src;
      hypnoVideo.src = pathToFileUrl(src);
    }
    if (hypnoEl) hypnoEl.classList.add('show');
    if (hypnoVideo) hypnoVideo.play().catch(() => {});
  } else {
    if (hypnoEl) hypnoEl.classList.remove('show');
    if (hypnoVideo) { try { hypnoVideo.pause(); } catch (_) {} }
  }
});

// Canvas won't use a custom font until it's explicitly loaded.
if (document.fonts && document.fonts.load) {
  document.fonts.load("800 100px 'Monument Extended'").catch(() => {});
}

// ── Text overlay (its own layer, beat-flash modes) ──────────────────────────

const textsEl = document.getElementById('texts');
const textsCanvas = document.getElementById('textsCanvas');
const textsCtx = textsCanvas ? textsCanvas.getContext('2d') : null;

let textOn = false;
let textRAF = null;
let textLines = ['RELAX'];
let textMode = 'beat-flash';
let textLastCycle = -1;
let textCurrentWord = 'RELAX';
let textLastKey = null; // last painted flash state, so static holds aren't re-rendered every frame
let textAffirmations = false; // main drives the word (synced to audio clips)
let forcedWord = '';          // current affirmation word ('' = nothing)
let textWanted = false;       // the beat-driven overlay is switched on
let narration = null;         // { lines:[{t,end,words}], startedAt, offset } while a voice plays

window.tiler.onTextOverlay(({ show, lines, mode, affirmations }) => {
  if (Array.isArray(lines) && lines.length) textLines = lines;
  if (mode) textMode = mode;
  textAffirmations = !!affirmations;
  textWanted = !!show;
  if (textWanted) showTexts();
  else if (!narration) hideTexts();
  else textLastKey = null; // the narration keeps the layer; nothing else to clear
});

window.tiler.onAffirmation(({ word }) => { forcedWord = (word || '').toUpperCase(); });

// A narration takes the text layer over while the voice plays: each spoken
// line's words flash in turn, spread evenly across the time the line is said.
window.tiler.onNarration(({ show, lines, startedAt, offset }) => {
  if (!show) {
    narration = null;
    if (textWanted) textLastKey = null; // hand the layer back to the beat text
    else hideTexts();
    return;
  }
  const clean = (w) => w.toUpperCase().replace(/^[^A-Z0-9']+|[^A-Z0-9']+$/g, '');
  narration = {
    startedAt: startedAt || Date.now(),
    offset: offset || 0,
    lines: (Array.isArray(lines) ? lines : [])
      .map((l) => ({ t: +l.t, end: +l.end, words: String(l.text || '').split(/\s+/).map(clean).filter(Boolean) }))
      .filter((l) => l.words.length && l.end > l.t),
  };
  textLastKey = null;
  showTexts();
});

// The word being spoken right now, or '' between lines. Each word gets an
// equal slice of its line; it is on for most of the slice and off for the
// rest, so consecutive words read as separate flashes.
function narrationWord() {
  const t = (Date.now() - narration.startedAt) / 1000 + narration.offset;
  for (const line of narration.lines) {
    if (t < line.t || t >= line.end) continue;
    const n = line.words.length;
    const pos = ((t - line.t) / (line.end - line.t)) * n;
    const i = Math.min(n - 1, Math.floor(pos));
    return { word: line.words[i], on: pos - i < 0.75, key: `${line.t}:${i}` };
  }
  return { word: '', on: false, key: '' };
}

function sizeTextsCanvas() {
  if (!textsCanvas) return;
  textsCanvas.width = window.innerWidth;
  textsCanvas.height = window.innerHeight;
}
function showTexts() {
  textOn = true;
  if (textsEl) textsEl.classList.add('show');
  sizeTextsCanvas();
  if (textRAF == null) textRAF = requestAnimationFrame(drawTexts);
}
function hideTexts() {
  textOn = false;
  if (textsEl) textsEl.classList.remove('show');
  if (textRAF != null) { cancelAnimationFrame(textRAF); textRAF = null; }
}
window.addEventListener('resize', () => { if (textOn) sizeTextsCanvas(); });

function pickLine() {
  return (textLines[Math.floor(Math.random() * textLines.length)] || 'RELAX').toUpperCase();
}

// Paint the word stretched to fill the whole screen — both width and height,
// non-uniformly (distorted), regardless of legibility.
function paintWord(word, alpha, scaleMul) {
  const w = textsCanvas.width, h = textsCanvas.height;
  textsCtx.clearRect(0, 0, w, h);
  if (alpha <= 0.001 || !word) return;

  const base = 200; // measure at a base size, then scale to fill
  textsCtx.font = `800 ${base}px 'Monument Extended', 'Segoe UI', sans-serif`;
  textsCtx.textAlign = 'center';
  textsCtx.textBaseline = 'alphabetic';
  const m = textsCtx.measureText(word);
  const asc = m.actualBoundingBoxAscent || base * 0.72;
  const desc = m.actualBoundingBoxDescent || base * 0.05;
  const tw = Math.max(1, m.actualBoundingBoxLeft + m.actualBoundingBoxRight || m.width);
  const th = Math.max(1, asc + desc);

  const sx = (w * 0.99 / tw) * scaleMul;
  const sy = (h * 0.98 / th) * scaleMul;

  textsCtx.save();
  textsCtx.translate(w / 2, h / 2);
  textsCtx.scale(sx, sy);
  textsCtx.globalAlpha = alpha;
  textsCtx.fillStyle = '#ffffff';
  textsCtx.fillText(word, 0, (asc - desc) / 2); // center the glyph box vertically
  textsCtx.restore();
}

function drawTexts() {
  if (!textOn || !textsCtx) { textRAF = null; return; }

  if (narration) {
    const { word, on, key } = narrationWord();
    const k = on ? `${key}:${word}` : '';
    if (k !== textLastKey) {
      textLastKey = k;
      if (on) paintWord(word, 1, 1);
      else textsCtx.clearRect(0, 0, textsCanvas.width, textsCanvas.height);
    }
    textRAF = requestAnimationFrame(drawTexts);
    return;
  }
  const beats = (Date.now() - tempoT0) * tempoBpm / 60000;

  // Phase + cycle for the current flash style (cyclePos = how many "phrases" elapsed).
  let cyclePos;
  if (textMode === 'pulse') cyclePos = beats / 4;
  else if (textMode === 'fade') cyclePos = beats / 6;
  else if (textMode === 'bar') cyclePos = beats / 8;       // on a bar, off a bar
  else if (textMode === 'half-beat') cyclePos = beats;     // on half a beat
  else if (textMode === 'quarter-flash') cyclePos = beats * 4;
  else cyclePos = beats;                                   // beat-flash (default)
  const cycle = Math.floor(cyclePos);
  const p = cyclePos - cycle;

  // Word source: affirmations are driven by main; otherwise random per cycle.
  let word;
  if (textAffirmations) {
    word = forcedWord; // changes only when a clip plays; '' during gaps
  } else {
    if (cycle !== textLastCycle) { textLastCycle = cycle; textCurrentWord = pickLine(); }
    word = textCurrentWord;
  }

  const continuous = (textMode === 'pulse' || textMode === 'fade');
  if (continuous) {
    // Animated styles: repaint every frame.
    let alpha, scale = 1;
    if (textMode === 'pulse') { alpha = Math.sin(p * Math.PI); scale = 0.5 + p * 0.9; }
    else { alpha = Math.sin(p * Math.PI); }
    if (!word || alpha <= 0.01) textsCtx.clearRect(0, 0, textsCanvas.width, textsCanvas.height);
    else paintWord(word, alpha, scale);
    textLastKey = null;
  } else {
    // Hard flash: on for the first half of the (quarter-/beat-/bar-)cycle.
    // Only repaint on a state change so a static hold isn't re-rendered each frame
    // (re-rendering the full-screen stretched text every frame causes jank).
    const on = !!word && p < 0.5;
    const key = on ? word : '';
    if (key !== textLastKey) {
      textLastKey = key;
      if (on) paintWord(word, 1, 1);
      else textsCtx.clearRect(0, 0, textsCanvas.width, textsCanvas.height);
    }
  }

  textRAF = requestAnimationFrame(drawTexts);
}

// ── Layout application ──────────────────────────────────────────────────────

function applyLayout(cells) {
  const incoming = new Set(cells.map((c) => c.instanceId));

  // Remove tiles no longer present (ended / evicted)
  for (const [id, entry] of registry) {
    if (!incoming.has(id)) {
      if (soloId === id) soloId = null; // the solo'd tile went away
      removeTile(entry);
      registry.delete(id);
    }
  }

  // Place / create tiles at their explicit pixel rectangles
  cells.forEach((cell) => {
    let entry = registry.get(cell.instanceId);
    if (entry) {
      entry.cell = { ...entry.cell, ...cell };
      positionTile(entry, cell); // animate to new region
      entry.setFolder(entry.cell);
    } else {
      entry = createTile(cell, cell.x, cell.y, cell.w, cell.h);
      registry.set(cell.instanceId, entry);
    }
  });
}

// Record a tile's home rectangle and move it there — unless it is currently
// solo'd, in which case the rectangle is only remembered for when solo ends.
function positionTile(entry, rect) {
  entry.rect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  if (soloId !== entry.cell.instanceId) {
    placeTile(entry.tile, rect.x, rect.y, rect.w, rect.h);
  }
  updatePan(entry);
}

function placeTile(tile, x, y, w, h) {
  tile.style.left = x + 'px';
  tile.style.top = y + 'px';
  tile.style.width = w + 'px';
  tile.style.height = h + 'px';
  applyControlDensity(tile);
}

// Full controls need room for six labelled buttons and a readable scrubber;
// below this a tile shows icons only. The setting can force either way.
const COMPACT_BELOW_W = 520;
const COMPACT_BELOW_H = 300;

function applyControlDensity(tile) {
  const mode = cfg.tileControls || 'auto';
  const w = parseFloat(tile.style.width) || 0;
  const h = parseFloat(tile.style.height) || 0;
  const compact = mode === 'compact' || (mode === 'auto' && (w < COMPACT_BELOW_W || h < COMPACT_BELOW_H));
  tile.classList.toggle('compact', compact);
}

// ── Solo: blow one tile up to fill the window, click again to drop back ───────

let soloId = null;

function toggleSolo(entry) {
  const id = entry.cell.instanceId;
  if (soloId === id) {
    soloId = null;
    document.body.classList.remove('has-solo');
    for (const e of registry.values()) {
      e.tile.classList.remove('solo');
      if (e.rect) placeTile(e.tile, e.rect.x, e.rect.y, e.rect.w, e.rect.h);
      updatePan(e);
    }
    flashHud('Solo off');
    return;
  }
  // Swapping the solo straight from another tile: put that one back first.
  const previous = soloId != null ? registry.get(soloId) : null;
  if (previous) {
    previous.tile.classList.remove('solo');
    if (previous.rect) placeTile(previous.tile, previous.rect.x, previous.rect.y, previous.rect.w, previous.rect.h);
    updatePan(previous);
  }
  soloId = id;
  document.body.classList.add('has-solo');
  entry.tile.classList.add('solo');
  placeTile(entry.tile, 0, 0, window.innerWidth, window.innerHeight);
  updatePan(entry);
  flashHud('Solo');
}

// ── Drag a tile onto another to trade their positions ────────────────────────

let dragFrom = null;

function tileEntryAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const tile = el && el.closest ? el.closest('.tile') : null;
  if (!tile) return null;
  const id = Number(tile.dataset.instance);
  return registry.get(id) || null;
}

function clearDropTarget() {
  for (const e of registry.values()) e.tile.classList.remove('drop-target');
}

function startTileDrag(entry, e) {
  dragFrom = entry;
  entry.tile.classList.add('dragging-tile');
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
}

function moveTileDrag(e) {
  if (!dragFrom) return;
  clearDropTarget();
  const over = tileEntryAt(e.clientX, e.clientY);
  if (over && over !== dragFrom) over.tile.classList.add('drop-target');
}

function endTileDrag(e) {
  if (!dragFrom) return;
  const from = dragFrom;
  dragFrom = null;
  from.tile.classList.remove('dragging-tile');
  clearDropTarget();
  try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
  const over = tileEntryAt(e.clientX, e.clientY);
  if (!over || over === from) return;
  window.tiler.swapTilePositions(from.cell.instanceId, over.cell.instanceId);
  flashHud('Swapped');
}

function createTile(cell, x, y, w, h) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.instance = String(cell.instanceId);
  placeTile(tile, x, y, w, h);

  // Stills go in an <img>; everything downstream treats it like the video
  // element, except that it has no audio and needs a timer to move it along.
  const isImage = cell.kind === 'image';
  const isWebcam = cell.kind === 'webcam';
  const video = document.createElement(isImage ? 'img' : 'video');
  if (isWebcam) {
    video.autoplay = true;
    video.muted = true; // the wall's audio comes from the clips, not the room
    video.playsInline = true;
  } else if (isImage) {
    video.decoding = 'async';
    video.src = pathToFileUrl(cell.path);
  } else {
    video.autoplay = !paused;
    video.muted = muted;
    video.volume = duckFactor;
    video.preload = 'auto';
    video.src = pathToFileUrl(cell.path);
  }

  // Per-instance crop position (% object-position), adjusted via the reframe handle.
  const crop = { x: 50, y: 50 };
  const entry = {
    tile, video, cell, crop, tileVolume: 1, audio: null,
    rect: { x, y, w, h }, isImage, isWebcam, holdTimer: null, stream: null,
  };
  tile.__entry = entry; // so the reframe handle can reach it

  if (isWebcam) {
    openWebcam(entry);
  } else if (isImage) {
    video.addEventListener('error', () => {
      rlog(`image failed: ${baseName(cell.path)}`);
      window.tiler.videoEnded(cell.instanceId);
    });
    startImageHold(entry);
  } else {
    video.addEventListener('loadedmetadata', () => {
      const skip = cfg.skipSeconds || 0;
      if (skip > 0 && isFinite(video.duration) && video.duration > skip + 0.5) {
        try { video.currentTime = skip; } catch (_) {}
      }
    });

    video.addEventListener('ended', () => {
      rlog(`ended: ${baseName(cell.path)}`);
      window.tiler.videoEnded(cell.instanceId);
    });

    video.addEventListener('error', () => {
      const code = video.error ? video.error.code : '?';
      rlog(`video error (${code}): ${baseName(cell.path)}`);
      window.tiler.videoEnded(cell.instanceId);
    });
  }

  const folderBadge = buildFolderBadge(entry);
  tile.appendChild(video);
  tile.appendChild(buildLoopBadge());
  tile.appendChild(folderBadge.el);
  tile.appendChild(buildOverlay(entry));
  if (!isImage && !isWebcam) tile.appendChild(buildScrubber(entry));
  grid.appendChild(tile);

  entry.setFolder = folderBadge.setFolder;
  entry.setFolder(entry.cell); // now that the overlay's priority buttons exist
  applyKenBurns(entry);
  if (!isImage && !isWebcam) {
    attachTileAudio(entry);
    if (!entry.audio) applyFallbackVolume(entry);
    if (!paused) video.play().catch((e) => rlog(`play() rejected: ${e.message}`));
  }

  // Fade in next frame so the transition runs
  requestAnimationFrame(() => requestAnimationFrame(() => tile.classList.add('visible')));

  return entry;
}

// A still has no natural end, so it holds its tile for the configured time and
// then reports itself finished, taking the same path a video's `ended` does.
// Live camera feed for a tile. Nothing else in the wall touches it: it has no
// queue entry, never ends, and is not part of the audio graph.
function openWebcam(entry) {
  const media = navigator.mediaDevices;
  if (!media || !media.getUserMedia) {
    rlog('webcam: getUserMedia unavailable');
    return;
  }
  media.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
    .then((stream) => {
      entry.stream = stream;
      entry.video.srcObject = stream;
      entry.video.play().catch(() => {});
      rlog('webcam: streaming');
      if (recordCfg && recordCfg.webcam) startRecording('camera', stream, false);
    })
    .catch((err) => {
      rlog(`webcam unavailable: ${err.name} — ${err.message}`);
      entry.tile.classList.add('webcam-failed');
    });
}

function closeWebcam(entry) {
  if (!entry.stream) return;
  stopRecording('camera'); // the file ends with the stream it was recording
  for (const track of entry.stream.getTracks()) {
    try { track.stop(); } catch (_) {}
  }
  entry.stream = null;
  try { entry.video.srcObject = null; } catch (_) {}
}

// ── Camera recording ────────────────────────────────────────────────────────
//
// Only a renderer can run a MediaRecorder, so the capture lives here; main owns
// the file and is handed a chunk every couple of seconds.

const CHUNK_MS = 2000;
let recordCfg = null;
const recordings = new Map(); // kind ('camera') → { recorder, stream, id }

window.tiler.onRecordConfig((c) => {
  recordCfg = c;
  rlog(`recording: camera=${!!c.webcam} ${c.bitrate}Mbps`);
  // The recorder starts with the camera stream in openWebcam().
});

window.tiler.onRecordStop(() => {
  for (const kind of [...recordings.keys()]) stopRecording(kind);
});

// MP4 with H.264 and AAC is what every player and editor opens, and this
// Chromium records it as fragmented MP4 — written a chunk at a time, so a
// crash mid-session still leaves a playable file. WebM (VP8 first: the encode
// has to keep up with a wall that is already working the machine hard) is only
// the fallback for a machine with no H.264 encoder.
function recordMimeType() {
  const wanted = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return wanted.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function recordExtension(mimeType) {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

async function startRecording(kind, stream, ownsStream) {
  if (!recordCfg || recordings.has(kind) || !stream) return;
  const mimeType = recordMimeType();
  if (!mimeType) { rlog('recording: no supported MediaRecorder format'); return; }

  const opened = await window.tiler.recordOpen(kind, recordExtension(mimeType));
  if (!opened) { rlog(`recording: could not open a ${kind} file`); return; }

  let recorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: Math.max(1, recordCfg.bitrate || 8) * 1000000,
      audioBitsPerSecond: 128000,
    });
  } catch (err) {
    rlog(`recording: MediaRecorder rejected the ${kind} stream — ${err.message}`);
    window.tiler.recordClose(opened.id, 'recorder failed to start');
    return;
  }

  // Chunks are turned into buffers asynchronously, so they are queued through a
  // chain — otherwise the final one could race the close and be dropped.
  let chain = Promise.resolve();
  recorder.ondataavailable = (e) => {
    if (!e.data || !e.data.size) return;
    chain = chain.then(async () => {
      const buf = new Uint8Array(await e.data.arrayBuffer());
      window.tiler.recordChunk(opened.id, buf);
    }).catch((err) => rlog(`recording: dropped a ${kind} chunk — ${err.message}`));
  };
  recorder.onerror = (e) => rlog(`recording: ${kind} error — ${(e.error && e.error.name) || 'unknown'}`);
  recorder.onstop = () => {
    chain.then(() => window.tiler.recordClose(opened.id));
    if (ownsStream) for (const t of stream.getTracks()) { try { t.stop(); } catch (_) {} }
  };

  recordings.set(kind, { recorder, stream, id: opened.id });
  recorder.start(CHUNK_MS);
  rlog(`recording ${kind} → ${opened.file} (${mimeType})`);

  // Stopping the screen share from outside the app (or unplugging the camera)
  // ends the recording rather than leaving a dead recorder behind.
  const [track] = stream.getVideoTracks();
  if (track) track.addEventListener('ended', () => stopRecording(kind));
}

function stopRecording(kind) {
  const rec = recordings.get(kind);
  if (!rec) return;
  recordings.delete(kind);
  try {
    if (rec.recorder.state !== 'inactive') rec.recorder.stop();
  } catch (err) {
    rlog(`recording: stopping ${kind} threw — ${err.message}`);
    window.tiler.recordClose(rec.id, 'stop failed');
  }
}

function startImageHold(entry) {
  stopImageHold(entry);
  if (entry.looping) return; // a looped still just stays put
  const seconds = Math.max(1, cfg.imageSeconds || 12);
  entry.holdTimer = setTimeout(() => {
    entry.holdTimer = null;
    if (paused) { startImageHold(entry); return; } // don't advance while paused
    window.tiler.videoEnded(entry.cell.instanceId);
  }, seconds * 1000);
}

function stopImageHold(entry) {
  if (entry.holdTimer) { clearTimeout(entry.holdTimer); entry.holdTimer = null; }
}

function buildLoopBadge() {
  const badge = document.createElement('div');
  badge.className = 'loop-badge';
  badge.textContent = '⟳ Looping';
  return badge;
}

// The clip's folder, shown top-left so it's obvious what a priority press
// would apply to. Boosted / avoided folders keep the badge lit.
function buildFolderBadge(entry) {
  const el = document.createElement('div');
  el.className = 'folder-badge';
  const setFolder = (cell) => {
    const level = cell.prefLevel || 0;
    el.textContent = (level > 0 ? '★'.repeat(level) + ' ' : level < 0 ? '⊘ ' : '')
      + (cell.folderLabel || baseName(cell.path));
    el.title = cell.folder || cell.path;
    el.classList.toggle('boosted', level > 0);
    el.classList.toggle('avoided', level < 0);
    entry.tile.classList.toggle('pref-marked', level !== 0);
    if (entry.prefButtons) {
      entry.prefButtons.prefer.classList.toggle('on', level > 0);
      entry.prefButtons.avoid.classList.toggle('on', level < 0);
    }
  };
  setFolder(entry.cell);
  return { el, setFolder };
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

// The overlay's icons: one line family, drawn with the current colour so the
// active tints apply to glyph and label alike.
const ICONS = {
  reframe: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  loop: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  previous: '<path d="M19 4 9 12l10 8V4z"/><path d="M5 5v14"/>',
  skip: '<path d="M5 4l10 8-10 8V4z"/><path d="M19 5v14"/>',
  prefer: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/>',
  avoid: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  remove: '<path d="M18 6 6 18M6 6l12 12"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
};

function controlMarkup(name, label) {
  return `<span class="icon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg></span><span class="label">${label}</span>`;
}

// Click-and-hold drag handle to reposition the crop (object-position). The video
// fills its tile via object-fit: cover; dragging pans which part of the overflow
// is visible. Double-click recenters. State is per-instance (lives on this tile).
function buildReframe(tile, video, crop) {
  const btn = document.createElement('button');
  btn.className = 'reframe';
  btn.innerHTML = controlMarkup('reframe', 'Reframe');
  btn.title = 'Hold and drag to reposition the crop · double-click to recenter';

  const apply = () => {
    video.style.objectPosition = `${crop.x}% ${crop.y}%`;
    refreshDriftFocus(tile.__entry);
  };
  apply();

  let dragging = false;
  let startX = 0, startY = 0, baseX = 50, baseY = 50, overflowX = 0, overflowY = 0;

  const computeOverflow = () => {
    const vw = video.videoWidth || video.naturalWidth;
    const vh = video.videoHeight || video.naturalHeight;
    const r = tile.getBoundingClientRect();
    if (!vw || !vh || !r.width || !r.height) { overflowX = 0; overflowY = 0; return; }
    const scale = Math.max(r.width / vw, r.height / vh);
    overflowX = vw * scale - r.width;
    overflowY = vh * scale - r.height;
  };

  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dragging = true;
    btn.classList.add('dragging');
    try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    startX = e.clientX; startY = e.clientY;
    baseX = crop.x; baseY = crop.y;
    computeOverflow();
  });

  btn.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.stopPropagation();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // Dragging the handle pans the crop on whichever axis overflows.
    if (overflowX > 0.5) crop.x = Math.min(100, Math.max(0, baseX - (dx / overflowX) * 100));
    if (overflowY > 0.5) crop.y = Math.min(100, Math.max(0, baseY - (dy / overflowY) * 100));
    apply();
  });

  const end = (e) => {
    if (!dragging) return;
    e.stopPropagation();
    dragging = false;
    btn.classList.remove('dragging');
    try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);

  btn.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    crop.x = 50; crop.y = 50;
    apply();
    flashHud('Recentered');
  });
  btn.addEventListener('click', (e) => e.stopPropagation());

  return btn;
}

// A slider drawn the same way everywhere: a hairline track, a fill and a knob.
// The whole band is the hit area; `set` takes 0..1 and `onInput` gets 0..1.
function buildSlider(onInput) {
  const el = document.createElement('div');
  el.className = 'slider';
  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('div');
  fill.className = 'fill';
  const knob = document.createElement('div');
  knob.className = 'knob';
  track.appendChild(fill);
  track.appendChild(knob);
  el.appendChild(track);

  const set = (f) => {
    const p = Math.min(1, Math.max(0, +f || 0)) * 100;
    fill.style.width = p + '%';
    knob.style.left = p + '%';
  };
  const fromX = (clientX) => {
    const r = track.getBoundingClientRect();
    return r.width ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
  };

  let dragging = false;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    dragging = true;
    el.classList.add('dragging');
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    const f = fromX(e.clientX);
    set(f);
    onInput(f);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.stopPropagation();
    const f = fromX(e.clientX);
    set(f);
    onInput(f);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    e.stopPropagation();
    dragging = false;
    el.classList.remove('dragging');
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  for (const ev of ['click', 'dblclick']) el.addEventListener(ev, (e) => e.stopPropagation());

  return { el, set, isDragging: () => dragging };
}

function buildScrubber(entry) {
  const { video } = entry;
  const scrubber = document.createElement('div');
  scrubber.className = 'scrubber';

  const curEl = document.createElement('span');
  curEl.className = 'time';
  curEl.textContent = '0:00';
  const durEl = document.createElement('span');
  durEl.className = 'time';
  durEl.textContent = '0:00';

  const seek = buildSlider((f) => {
    if (!isFinite(video.duration) || video.duration <= 0) return;
    try { video.currentTime = f * video.duration; } catch (_) {}
    curEl.textContent = fmtTime(video.currentTime);
  });
  seek.el.classList.add('seek');

  const render = () => {
    const p = isFinite(video.duration) && video.duration > 0 ? video.currentTime / video.duration : 0;
    seek.set(p);
    curEl.textContent = fmtTime(video.currentTime);
  };

  scrubber.append(curEl, seek.el, durEl, buildTileVolume(entry));

  video.addEventListener('timeupdate', () => { if (!seek.isDragging()) render(); });
  video.addEventListener('loadedmetadata', () => {
    durEl.textContent = isFinite(video.duration) ? fmtTime(video.duration) : 'live';
    render();
  });

  return scrubber;
}

// Per-tile volume, on top of the master volume and auto-leveling.
function buildTileVolume(entry) {
  const wrap = document.createElement('div');
  wrap.className = 'tile-vol';
  wrap.innerHTML = `<span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.volume}</svg></span>`;
  const vol = buildSlider((f) => {
    entry.tileVolume = f;
    if (entry.audio) entry.audio.tileGain.gain.value = entry.tileVolume;
    else applyFallbackVolume(entry);
  });
  vol.set(entry.tileVolume);
  vol.el.title = 'Volume for this tile';
  wrap.appendChild(vol.el);
  return wrap;
}

function buildOverlay(entry) {
  const { tile, video, cell, crop } = entry;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const loopBtn = document.createElement('button');
  loopBtn.innerHTML = controlMarkup('loop', 'Loop');
  loopBtn.title = 'Keep this video looping in its tile';
  loopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (entry.isImage) {
      // "Looping" a still means pinning it: cancel the hold so it stays up.
      entry.looping = !entry.looping;
      if (entry.looping) stopImageHold(entry); else startImageHold(entry);
    } else {
      video.loop = !video.loop;
      entry.looping = video.loop;
    }
    loopBtn.classList.toggle('active', !!entry.looping);
    tile.classList.toggle('looping', !!entry.looping);
    flashHud(entry.looping ? (entry.isImage ? 'Held' : 'Loop on') : 'Loop off');
  });

  const skipBtn = document.createElement('button');
  skipBtn.innerHTML = controlMarkup('skip', 'Skip');
  skipBtn.title = 'Swap the next video into this tile (the tile stays put)';
  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    entry.looping = false;
    if (entry.isImage) stopImageHold(entry); else video.loop = false; // let it advance
    window.tiler.swapTile(cell.instanceId);
  });

  const previousBtn = document.createElement('button');
  previousBtn.innerHTML = controlMarkup('previous', 'Previous');
  previousBtn.title = 'Return to the previous clip shown in this tile';
  previousBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    entry.looping = false;
    if (entry.isImage) stopImageHold(entry); else video.loop = false;
    window.tiler.previousTile(cell.instanceId);
  });

  // Folder priority: ★ makes this clip's folder show up more often, ⊘ (one step
  // below normal) drops it from playback entirely.
  const preferBtn = document.createElement('button');
  preferBtn.className = 'prefer';
  preferBtn.innerHTML = controlMarkup('prefer', 'Prefer');
  preferBtn.title = 'Move this folder to the front of the queue (again to clear)';
  preferBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.tiler.folderPref(entry.cell.folder, 1);
  });

  const avoidBtn = document.createElement('button');
  avoidBtn.className = 'avoid';
  avoidBtn.innerHTML = controlMarkup('avoid', 'Avoid');
  avoidBtn.title = 'Send this folder to the back of the queue (again to clear)';
  avoidBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.tiler.folderPref(entry.cell.folder, -1);
  });

  const removeBtn = document.createElement('button');
  removeBtn.innerHTML = controlMarkup('remove', 'Remove');
  removeBtn.title = 'Remove this tile (the others reflow to fill the space)';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.tiler.removeTile(cell.instanceId);
  });

  const strip = document.createElement('div');
  strip.className = 'strip';
  strip.appendChild(buildReframe(tile, video, crop));
  if (!entry.isWebcam) {
    strip.appendChild(loopBtn);
    strip.appendChild(previousBtn);
    strip.appendChild(skipBtn);
    strip.appendChild(preferBtn);
    strip.appendChild(avoidBtn);
  }
  strip.appendChild(removeBtn);
  overlay.appendChild(strip);

  const hint = document.createElement('div');
  hint.className = 'overlay-hint';
  hint.textContent = 'drag onto another tile to swap · double-click to solo';
  overlay.appendChild(hint);

  // The overlay's own background (not its buttons) is the tile's grab handle.
  const onBackground = (e) => e.target === overlay || e.target === hint || e.target === strip;
  overlay.addEventListener('pointerdown', (e) => {
    if (!onBackground(e)) return;
    e.preventDefault();
    startTileDrag(entry, e);
  });
  overlay.addEventListener('pointermove', moveTileDrag);
  overlay.addEventListener('pointerup', endTileDrag);
  overlay.addEventListener('pointercancel', endTileDrag);
  overlay.addEventListener('dblclick', (e) => {
    if (!onBackground(e)) return;
    e.stopPropagation();
    toggleSolo(entry);
  });

  entry.prefButtons = { prefer: preferBtn, avoid: avoidBtn };
  return overlay;
}

// Swap a tile for a fresh one of the other media kind, keeping its rectangle.
function rebuildTile(entry, cell) {
  const { x, y, w, h } = entry.rect;
  removeTile(entry);
  registry.delete(entry.cell.instanceId);
  const next = createTile(cell, x, y, w, h);
  registry.set(cell.instanceId, next);
}

function removeTile(entry) {
  const { tile, video } = entry;
  tile.classList.remove('visible'); // fade out
  stopImageHold(entry);
  closeWebcam(entry);
  if (!entry.isImage) { try { video.pause(); } catch (_) {} }
  setTimeout(() => {
    try {
      video.removeAttribute('src');
      if (!entry.isImage) video.load();
    } catch (_) {}
    if (entry.audio) {
      for (const node of ['source', 'analyser', 'norm', 'tileGain', 'panner']) {
        try { entry.audio[node].disconnect(); } catch (_) {}
      }
      entry.audio = null;
    }
    if (tile.parentNode) tile.parentNode.removeChild(tile);
  }, 500);
}

// ── Global controls ───────────────────────────────────────────────────────────

function togglePause() {
  paused = !paused;
  flashHud(paused ? 'Paused' : 'Playing');
  for (const entry of registry.values()) {
    if (entry.isWebcam) continue; // the room doesn't pause
    if (entry.isImage) {
      // Pausing freezes a still's hold timer; resuming restarts it.
      if (paused) stopImageHold(entry); else startImageHold(entry);
      continue;
    }
    if (paused) { try { entry.video.pause(); } catch (_) {} }
    else entry.video.play().catch(() => {});
  }
}

function toggleMute() {
  muted = !muted;
  flashHud(muted ? 'Muted' : 'Unmuted');
  for (const entry of registry.values()) {
    if (!entry.isImage) entry.video.muted = muted;
  }
}

// ── HUD ─────────────────────────────────────────────────────────────────────

let hudTimer = null;
function flashHud(text) {
  let hud = document.getElementById('hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'hud';
    document.body.appendChild(hud);
  }
  hud.textContent = text;
  hud.classList.add('show');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => hud.classList.remove('show'), 900);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function baseName(p) {
  return p.replace(/\\/g, '/').split('/').pop();
}

function pathToFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([a-zA-Z]):\/(.*)$/);
  if (driveMatch) {
    const rest = driveMatch[2].split('/').map(encodeURIComponent).join('/');
    return `file:///${driveMatch[1]}:/${rest}`;
  }
  return 'file://' + normalized.split('/').map(encodeURIComponent).join('/');
}
