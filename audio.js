'use strict';

// Hidden window: plays the music track (single sound source for the whole app)
// and detects its BPM offline, reporting tempo + a beat anchor back to main.
// Runs with nodeIntegration so it can read the file and use ipcRenderer directly.

const fs = require('fs');
const { ipcRenderer } = require('electron');

let ctx = null;
let source = null;
let musicGain = null;
let affSource = null;
let musicPath = '';       // the track that is playing
let musicStartAt = 0;     // ctx.currentTime when it started
let musicOffset = 0;      // seconds into the track at that moment
let positionTimer = null;

// Seconds into the (looping) track right now.
function musicSeconds() {
  if (!ctx || !source || !source.buffer) return 0;
  const d = source.buffer.duration || 0;
  if (!d) return 0;
  return (musicOffset + (ctx.currentTime - musicStartAt)) % d;
}

// Tell main where the track is, so the next session can pick up from there.
function reportPosition() {
  if (!source || !musicPath) return;
  ipcRenderer.send('music-position', { path: musicPath, seconds: musicSeconds() });
}

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = ctx.createGain();
    musicGain.connect(ctx.destination);
  }
  return ctx;
}

function stopMusic() {
  if (positionTimer) { clearInterval(positionTimer); positionTimer = null; }
  reportPosition(); // the last word on where it got to
  musicPath = '';
  if (source) {
    try { source.stop(); } catch (_) {}
    try { source.disconnect(); } catch (_) {}
    source = null;
  }
}

ipcRenderer.on('stop-music', stopMusic);

ipcRenderer.on('duck-music', (_e, { factor }) => {
  if (!ctx || !musicGain) return;
  const now = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(musicGain.gain.value, now);
  musicGain.gain.linearRampToValueAtTime(factor, now + 0.4);
});

// Play an affirmation clip at full volume (the music is ducked separately by main).
ipcRenderer.on('play-affirmation', async (_e, { path: filePath }) => {
  try {
    ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    if (affSource) { try { affSource.stop(); } catch (_) {} affSource = null; }
    const file = fs.readFileSync(filePath);
    const arr = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const buffer = await ctx.decodeAudioData(arr);
    affSource = ctx.createBufferSource();
    affSource.buffer = buffer;
    affSource.connect(ctx.destination);
    affSource.onended = () => { affSource = null; ipcRenderer.send('affirmation-ended'); };
    affSource.start(0);
  } catch (e) {
    ipcRenderer.send('audio-error', 'affirmation: ' + String((e && e.message) || e));
    ipcRenderer.send('affirmation-ended'); // keep the sequence moving
  }
});

// ── Cues: narration and countdown sounds ─────────────────────────────────────
//
// Decoded once and cached, so a cue starts the instant it is asked for and
// main knows its length ahead of time (for clips that must END on a moment).
// Each cue id ('narration', 'goal') is its own voice, so the two can overlap.

const cueBuffers = new Map(); // path → AudioBuffer
const cueSources = new Map(); // id → AudioBufferSourceNode

async function loadCue(filePath) {
  if (cueBuffers.has(filePath)) return cueBuffers.get(filePath);
  ensureCtx();
  const file = fs.readFileSync(filePath);
  const arr = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const buffer = await ctx.decodeAudioData(arr);
  cueBuffers.set(filePath, buffer);
  ipcRenderer.send('cue-loaded', { path: filePath, duration: buffer.duration });
  return buffer;
}

function stopCue(id) {
  const src = cueSources.get(id);
  if (!src) return;
  cueSources.delete(id);
  try { src.stop(); } catch (_) {}
  try { src.disconnect(); } catch (_) {}
}

ipcRenderer.on('load-cue', (_e, { path: filePath }) => {
  loadCue(filePath).catch((e) => ipcRenderer.send('audio-error', 'cue: ' + String((e && e.message) || e)));
});

ipcRenderer.on('stop-cue', (_e, { id } = {}) => {
  if (id) stopCue(id);
  else for (const k of [...cueSources.keys()]) stopCue(k);
});

ipcRenderer.on('play-cue', async (_e, { id, path: filePath, offset }) => {
  try {
    stopCue(id);
    ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const buffer = await loadCue(filePath);
    const at = Math.min(Math.max(0, +offset || 0), Math.max(0, buffer.duration - 0.05));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (cueSources.get(id) === src) cueSources.delete(id);
      ipcRenderer.send('cue-ended', { id });
    };
    cueSources.set(id, src);
    src.start(0, at);
  } catch (e) {
    ipcRenderer.send('audio-error', 'cue: ' + String((e && e.message) || e));
    ipcRenderer.send('cue-ended', { id }); // keep main's state moving
  }
});

ipcRenderer.on('play-music', async (_e, { path: filePath, offset }) => {
  try {
    stopMusic();
    ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const file = fs.readFileSync(filePath);
    const arr = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const buffer = await ctx.decodeAudioData(arr);

    // Start where the track was left last time (wrapped, since it loops).
    const d = buffer.duration || 0;
    const at = d ? (((+offset || 0) % d) + d) % d : 0;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(musicGain);
    const startWall = Date.now();
    source.start(0, at);
    musicPath = filePath;
    musicStartAt = ctx.currentTime;
    musicOffset = at;
    positionTimer = setInterval(reportPosition, 2000);

    const { bpm, firstPeakSec } = await detectBPM(buffer);
    if (bpm) {
      // The first peak is `firstPeakSec` into the track; at `startWall` the
      // track was already `at` seconds in, so that beat fell (or falls) here.
      ipcRenderer.send('music-info', { bpm, t0: startWall + (firstPeakSec - at) * 1000 });
    }
  } catch (e) {
    ipcRenderer.send('audio-error', String((e && e.message) || e));
  }
});

// ── Offline BPM detection (band-limited peak interval histogram) ───────────────

async function detectBPM(buffer) {
  const offline = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  const lp = offline.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
  const hp = offline.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
  src.connect(lp); lp.connect(hp); hp.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const data = rendered.getChannelData(0);
  const sr = rendered.sampleRate;

  const peaks = getPeaks(data, sr);
  if (peaks.length < 4) return { bpm: 0, firstPeakSec: 0 };
  const groups = getTempoGroups(peaks, sr);
  if (!groups.length) return { bpm: 0, firstPeakSec: 0 };
  return { bpm: groups[0].bpm, firstPeakSec: peaks[0].position / sr };
}

// Loudest sample in each ~0.5s window, keep the top half by volume.
function getPeaks(data, sr) {
  const partSize = Math.round(sr * 0.5);
  const parts = Math.floor(data.length / partSize);
  const peaks = [];
  for (let i = 0; i < parts; i++) {
    let max = 0, idx = i * partSize;
    for (let j = i * partSize; j < (i + 1) * partSize; j++) {
      const v = Math.abs(data[j]);
      if (v > max) { max = v; idx = j; }
    }
    peaks.push({ position: idx, volume: max });
  }
  peaks.sort((a, b) => b.volume - a.volume);
  const top = peaks.slice(0, Math.max(4, Math.round(peaks.length * 0.5)));
  top.sort((a, b) => a.position - b.position);
  return top;
}

// Tally BPMs implied by intervals between nearby peaks; the most common wins.
function getTempoGroups(peaks, sr) {
  const groups = [];
  for (let i = 0; i < peaks.length; i++) {
    for (let j = 1; j < 10 && i + j < peaks.length; j++) {
      const interval = peaks[i + j].position - peaks[i].position;
      if (interval <= 0) continue;
      let bpm = 60 / (interval / sr);
      while (bpm < 80) bpm *= 2;
      while (bpm >= 160) bpm /= 2;
      bpm = Math.round(bpm);
      const g = groups.find((x) => x.bpm === bpm);
      if (g) g.count++; else groups.push({ bpm, count: 1 });
    }
  }
  groups.sort((a, b) => b.count - a.count);
  return groups;
}

ipcRenderer.send('audio-ready');
