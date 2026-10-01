'use strict';

const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Log to a fixed path immediately so even require-time / pre-ready crashes are captured.
logger.init(__dirname);
logger.log('BOOT', 'main.js loading. argv:', process.argv.join(' '));
logger.log('BOOT', 'ELECTRON_RUN_AS_NODE =', process.env.ELECTRON_RUN_AS_NODE || '(unset)');

const electron = require('electron');
logger.log('BOOT', 'require(electron) type =', typeof electron, '| has app =', !!(electron && electron.app));

const { app, BrowserWindow, ipcMain, screen, dialog } = electron;
const { chooseLayout, CENTER_MAX_SURROUND } = require('./layout');

// Performance: keep every monitor's renderer running full-speed (windows that
// aren't focused/visible are throttled by default, which stutters a video wall),
// and don't let driver blocklists disable GPU video decode.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.flac', '.aac', '.opus']);
const MAX_ACTIVE_TILES = 6;   // ceiling for the best-fit mosaic
const MAX_GRID_TILES = 16;    // ceiling for a forced cols x rows grid
const PREF_PREFER = 1;        // folder's clips jump to the front of the queue
const PREF_AVOID = -1;        // folder's clips are pushed to the very back
const HISTORY_MAX = 200;      // sessions kept in the history graph
const VIDEO_HISTORY_MAX = 2000;
const CLIMAX_HISTORY_MAX = 200;
const TILE_HISTORY_MAX = 50;
const POPPERS_OPTIONS = [
  { id: 'rush', label: 'Rush', file: 'rush.png' },
  { id: 'jungle-juice', label: 'Jungle Juice', file: 'jungle-juice.png' },
  { id: 'amsterdam', label: 'Amsterdam', file: 'amsterdam.png' },
  { id: 'blue-boy', label: 'Blue Boy', file: 'blue-boy.png' },
  { id: 'hardware', label: 'Hardware', file: 'hardware.png' },
  { id: 'locker-room', label: 'Locker Room', file: 'locker-room.png' },
  { id: 'english-royale', label: 'English Royale', file: 'english-royale.png' },
];
// Sentinel path for the live camera tile — it is a member of state.active like
// any clip, but it is never gathered from the queue and never advances.
const WEBCAM_PATH = '\u0000webcam';
const LENGTH_MAX = 3600; // length ceiling (s = 1 hr); maxLength at/above this means "no limit"

// ── State ───────────────────────────────────────────────────────────────────

let controlWin = null;
let windows = [];                 // player windows
let blankWindows = [];            // black filler windows on unused screens
let mediaQueue = [];
let watchedFolders = [];
let watchers = [];
let rescanTimer = null;
let globalQueueIndex = 0;
let instanceSeq = 0;
let quitting = false;             // a quit is under way; stop scheduling more
let restarting = false;           // swapping player windows during a (re)start
const recentlyPlayed = new Map(); // path → epoch ms it was last put on a tile
// Session recording: id → { file, out, kind, bytes }. A renderer holds the
// MediaRecorder and streams chunks here; main only ever appends them to disk.
const openRecordings = new Map();
let recordingStamp = '';          // shared filename prefix for one session's files
let recordingSeq = 0;
let recordingWaiters = [];        // resolved once every file is closed
let finishingRecordings = null;   // in-flight finishRecordings() promise
let sessionClosedOut = false;     // guard so the quit bookkeeping runs once
let playbackStartedAt = 0;        // epoch ms the current session began (0 = idle)
let progressiveTimer = null;
let progressiveT0 = 0;
let historySaveTimer = null;

// Breathing exercise scheduler
let breathingTimer = null;
let breathingEndTimer = null;
let breathingActive = false;
let breathingNextAt = 0;
let breathingIntervalMs = 0;

// Tempo clock (shared beat phase across all windows)
let tempoBpm = 60;
let tempoTargetBpm = 60;
let tempoT0 = 0;            // epoch ms reference; beats = (now - t0)*bpm/60000
let tempoRamp = null;
let rhythmShown = false;
let hypnoShown = false;
let hypnoIndex = 0;
let hypnoCycleTimer = null;
let textShown = false;
let affirmationTimer = null;

// Narration + countdown sound ("cues": clips the audio window decodes once)
const cueDurations = new Map();  // path → seconds, reported by the audio window
let narrationStartTimer = null;  // the session-start play
let narrationLeadTimer = null;   // the breathing lead-in
let narrationActive = null;      // { startedAt, offset } while the voice plays
let goalSoundTimer = null;
let goalSoundPlaying = false;
let tapTimes = [];

// Meditation goal timer
let goalTimer = null;
let goalSessionStart = 0;
let goalTarget = 0;
let goalSaveTick = 0;

// Hidden music/analysis window
let audioWin = null;
let audioReady = false;
let pendingMusic = null;
let musicPosition = null;      // { file, seconds } - where the track last was
let musicPositionSavedAt = 0;  // epoch ms of the last write to disk

const windowStates = new Map();   // playerWin.id → { display, ready, active:[{instanceId,item}], relayoutChain }

// Config (persisted)
let config = {
  folders: [],
  skipSeconds: 5,
  shuffle: true,
  layoutMode: 'auto',  // 'auto' = best-fit mosaic, 'grid' = a forced cols x rows grid,
                       // 'center' = one big centre tile ringed by smaller ones
  gridCols: 3,         // forced-grid shape (layoutMode 'grid')
  gridRows: 1,
  heroCell: false,        // one oversized cell in the grid, the rest filling around it
  heroSpan: 2,            // hero size in grid cells (2 = 2x2)
  heroPosition: 'top-left',
  centerSize: 50,         // centre + surround: the centre tile's share of the screen, in percent
  surroundTiles: 8,       // ...and how many tiles ring it (4-12)
  folderRoundRobin: true, // deal the queue one clip per folder in turn
  cooldownMinutes: 20,    // don't repeat a clip for this long (0 = off)
  maxCols: 3,
  maxRows: 1,
  minCols: 1,  // floor on the subdivision in auto mode (bias toward more tiles)
  minRows: 1,
  orientation: 'any', // 'any' | 'vertical' | 'horizontal' — only load clips of this shape
  replaceInPlace: false, // a finished clip is swapped into its tile instead of re-flowing the wall
  edgeInserts: true,     // show the left/right edge buttons that add a tile
  tileControls: 'auto',  // the hover controls: 'auto' = icons only on small tiles, 'full', 'compact'
  windowCount: 0, // 0 = auto (one window per screen)
  blankUnusedScreens: true, // cover screens with no player window in black
  spanAllScreens: false, // one window stretched across all monitors
  webcamEnabled: false,   // give one tile over to a live camera feed
  webcamScreen: 0,        // which player window hosts it
  webcamHero: true,       // put it in the hero / first cell rather than letting it float
  // Camera recording starts with the wall and ends when the app quits.
  recordWebcam: false,
  recordBitrate: 8,
  recordFolder: '',       // where the files land ('' = Videos\Video Tiler)
  condensed: false,     // settings window: hide the explanations, two columns
  imagesEnabled: false, // mix still images in among the videos
  imageFolders: [],     // folders stills are taken from (a folder can be both)
  imageSeconds: 12,     // how long a still holds its tile before moving on
  qualityFilter: false, // skip clips below the resolution floor below
  minHeight: 720,       // that floor, in pixels on the clip's shorter side
  screenZones: [], // screenZones[i] = folders window i draws from ([] = the whole library)
  minLength: 0, // only load videos at least this many seconds (0 = no minimum)
  maxLength: LENGTH_MAX, // ...and at most this many (>= LENGTH_MAX = no maximum)
  // Breathing exercise
  breathingEnabled: false,
  breathingIntervalMin: 10, // minutes between exercises
  breathsPerExercise: 5,
  inhaleSeconds: 4,
  holdSeconds: 4,
  exhaleSeconds: 6,
  holdAfterSeconds: 0,
  breathingSound: true,
  poppersBrand: 'rush', // bundled product image that fills up to represent the countdown
  countdownX: -1,     // px from left (-1 = default bottom-left)
  countdownY: -1,     // px from top
  countdownHeight: 220, // px
  // Tempo / rhythm
  bpm: 60,
  // Music
  musicEnabled: false,
  musicFile: '',
  // Hypnosis patterns (grayscale video loops, white→transparent via multiply)
  patternFolder: '',     // folder of grayscale pattern videos; empty = bundled defaults
  hypnoOpacity: 25,      // percent
  hypnoCycle: false,     // auto-cycle through pattern clips
  hypnoCycleSeconds: 20,
  // Text overlay (its own layer, on top of patterns)
  textEnabled: false,
  textMode: 'beat-flash', // beat-flash | quarter-flash | pulse | fade
  hypnoText: 'Relax',
  hypnoLines: [],        // optional multi-line text source (overrides hypnoText when non-empty)
  affirmationFolder: '', // clips whose filename is the transcript; drives text + ducked audio
  // Narration: a voice file (from the hypnosis studio) whose spoken lines flash
  // on screen in step with the voice, read from the .json written beside it.
  narrationFile: '',
  narrationText: true,             // flash the words as they are spoken
  narrationAtStart: true,          // play once as the wall comes up
  narrationBeforeBreathing: false, // ...and as a lead-in that ends as each breathing exercise begins
  // Beat sync
  breathingBeatSync: false, // breathing phase numbers are counted in beats, exercise starts on a beat
  videoBeatSync: false,     // video re-tiles land on the next beat
  // Meditation goal timer
  goalEnabled: false,
  goalCountdown: true,      // count down the last 10s before reaching the target
  goalCountdownSound: '',   // a sound file timed to end exactly as the target is reached
  goalMinutes: 0,           // fixed target in minutes (0 = use personal best as the target)
  personalBest: 0,          // longest session in seconds (persisted)
  // Folder preferences: absolute folder path → level. -1 hides the folder,
  // 0 is normal, 1..PREF_MAX make its clips proportionally more likely.
  folderPrefs: {},
  // Audio
  volume: 100,          // master volume (percent)
  normalizeAudio: true, // per-tile auto-leveling toward a common loudness
  normalizeTarget: 40,  // how loud auto-leveling aims (percent; lower = more headroom)
  limiter: true,        // catch the peaks the auto-leveling pushes up
  stereoPan: false,     // pan each tile by its position on the wall
  stereoPanAmount: 60,  // percent of full left/right at the screen edges
  // Motion
  kenBurns: false,        // slow drift / zoom
  kenBurnsAmount: 6,      // percent of extra zoom the drift travels through
  kenBurnsSeconds: 30,    // seconds for one sweep (higher = slower)
  kenBurnsRotate: 0,      // degrees the drift sways through (0 = no rotation)
  kenBurnsBeatSync: false, // take the sweep length from the music tempo instead
  kenBurnsBeats: 16,      // beats per sweep when synced
  kenBurnsCenter: 'random', // 'random' | 'center' | 'crop' — what the zoom pulls toward
  kenBurnsScope: 'tile',  // 'tile' = each tile drifts, 'wall' = the whole wall as one
  // Progressive intensity — ease the wall up over the first stretch of a session
  progressiveEnabled: false,
  progressiveMinutes: 20, // how long the ramp takes to reach full intensity
  progressiveStartTiles: 1,
  // Session history: [{ at: epoch ms, seconds }], newest last
  sessionHistory: [],
  // Playback history and climax snapshots remain local in config.json.
  videoHistory: [],
  climaxHistory: [],
  oCount: 0,
  videoOCounts: {},
  // Named setting bundles; `presets[name]` is a partial config to merge in.
  presets: {},
  activePreset: '',
  presetsSeeded: 0, // highest PRESETS_VERSION whose built-ins have been handed out
  // Named folder sets, kept apart from presets so a layout can be switched
  // without touching the library and vice versa.
  // folderSets[name] = { folders, imageFolders, folderPrefs, screenZones }
  folderSets: {},
  activeFolderSet: '',
  folderSetsMigrated: false, // presets used to carry folders; moved into sets once
};

// Videos start with audio; toggle at runtime with the M key.
let startMuted = false;

// Dimension probing
let probeWin = null;
let probeReady = false;
let probeReadyWaiters = [];
let probeRequestSeq = 0;
const pendingProbes = new Map();
const dimsCache = new Map();

// ── Crash capture ─────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  logger.log('FATAL', 'uncaughtException:', err && err.stack ? err.stack : String(err));
});
process.on('unhandledRejection', (reason) => {
  logger.log('FATAL', 'unhandledRejection:', reason && reason.stack ? reason.stack : String(reason));
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // In a packaged app __dirname is inside the read-only asar, so log to userData.
  if (app.isPackaged) logger.init(app.getPath('userData'));
  logger.log('APP', 'Ready. userData =', app.getPath('userData'));
  logger.log('APP', 'Electron', process.versions.electron, 'Chrome', process.versions.chrome, 'Node', process.versions.node);

  try {
    loadConfig();
  loadMusicPosition();
    // Chromium asks before opening a camera; this is a local app and the user
    // has already opted in with the setting, so answer for them.
    electron.session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      if (permission === 'media') {
        cb(!!config.webcamEnabled);
        return;
      }
      cb(permission === 'mediaKeySystem' && !!config.webcamEnabled);
    });
    createProbeWindow();
    createAudioWindow();
    setupIPC();

    // Auto-start (skip control window) if a folder is passed via CLI arg or VT_FOLDER.
    const argFolder = process.argv.slice(2).find((a) => {
      try { return fs.statSync(a).isDirectory(); } catch { return false; }
    });
    const autoFolder = argFolder || process.env.VT_FOLDER;
    if (autoFolder && fs.existsSync(autoFolder)) {
      logger.log('FOLDER', 'Auto-start folder:', autoFolder);
      config.folders = [autoFolder];
      startPlayback();
    } else {
      createControlWindow();
    }
  } catch (e) {
    logger.log('FATAL', 'Startup error:', e && e.stack ? e.stack : String(e));
  }
}).catch((e) => {
  logger.log('FATAL', 'whenReady error:', e && e.stack ? e.stack : String(e));
});

// The hidden prober/audio windows keep 'window-all-closed' from ever firing, so
// the session is closed out here — this is the path a normal quit takes.
app.on('before-quit', (e) => {
  if (!sessionClosedOut) {
    sessionClosedOut = true;
    quitting = true;
    flushHistorySave();
    persistGoalBest();
    recordSession();
    saveMusicPosition();
  }
  // A recording is only a file once the renderer has handed over its last chunk,
  // so hold the quit open until every one has been flushed and closed.
  if (openRecordings.size) {
    e.preventDefault();
    logger.log('REC', `Holding the quit for ${openRecordings.size} recording(s)`);
    finishRecordings('quit').then(() => app.quit());
  }
});

// ...and for the same reason the app would otherwise linger as an invisible
// process once the last window is gone — holding a lock on the build output and
// quietly eating a slot in Task Manager. Quit as soon as nothing user-facing is
// left. Deferred by a tick because restarting playback closes the old windows
// before it opens the new ones.
function quitWhenNothingVisible() {
  if (quitting || restarting) return;
  setImmediate(() => {
    if (quitting || restarting) return;
    const controlOpen = controlWin && !controlWin.isDestroyed();
    const playersOpen = windows.some((w) => !w.isDestroyed());
    if (controlOpen || playersOpen) return;
    logger.log('APP', 'Last window closed; quitting');
    app.quit();
  });
}

app.on('window-all-closed', () => {
  logger.log('APP', 'All windows closed; quitting');
  persistGoalBest();
  recordSession();
  saveMusicPosition();
  if (process.platform !== 'darwin') app.quit();
});

// ── Config persistence ──────────────────────────────────────────────────────

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  let saved = null;
  try {
    saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    config = { ...config, ...saved };
    logger.log('CONFIG', 'Loaded:', JSON.stringify(config));
  } catch (_) {
    logger.log('CONFIG', 'No saved config; using defaults:', JSON.stringify(config));
  }
  migrateConfig(saved);
  seedBuiltinPresets();
}

// The resolution floor used to be a bare number where 0 meant off; it is a
// switch plus a threshold now. Anyone who had a floor set keeps it turned on.
// This has to read the saved file rather than the merged config, which already
// carries the new key's default.
function migrateConfig(saved) {
  if (saved && saved.qualityFilter === undefined && (saved.minHeight || 0) > 0) {
    config.qualityFilter = true;
    logger.log('CONFIG', `Kept the existing ${saved.minHeight}p floor and turned the quality filter on`);
  }
  if (!config.minHeight) config.minHeight = 720;
  // One image folder became a per-folder role, so the old single path joins the list.
  if (saved && !Array.isArray(saved.imageFolders)) {
    // Stills used to come from every scanned folder plus one image-only folder;
    // they are a per-folder role now, so give the role to all of them.
    const carried = saved.imagesEnabled ? [...(saved.folders || [])] : [];
    if (saved.imageFolder) carried.push(saved.imageFolder);
    if (carried.length) {
      config.imageFolders = [...new Set(carried)];
      logger.log('CONFIG', `Marked ${config.imageFolders.length} folder(s) as image sources`);
    }
    delete config.imageFolder;
  }
  if (!Array.isArray(config.imageFolders)) config.imageFolders = [];
  if (!config.folderSets || typeof config.folderSets !== 'object') config.folderSets = {};
  if (!POPPERS_OPTIONS.some((o) => o.id === config.poppersBrand)) config.poppersBrand = 'rush';
  if (!Array.isArray(config.videoHistory)) config.videoHistory = [];
  if (!Array.isArray(config.climaxHistory)) config.climaxHistory = [];
  if (!Number.isFinite(config.oCount) || config.oCount < 0) config.oCount = 0;
  if (!config.videoOCounts || typeof config.videoOCounts !== 'object' || Array.isArray(config.videoOCounts)) {
    config.videoOCounts = {};
  }
  delete config.recordWall;
  delete config.recordWallScreen;
  delete config.recordAudio;
  // Presets used to carry the folder list along with everything else. Folders
  // live in folder sets now, so a preset that had some becomes a set of the
  // same name (unless one exists already) and keeps only its settings.
  if (!config.folderSetsMigrated) {
    const presets = {};
    let moved = 0;
    for (const [name, preset] of Object.entries(config.presets || {})) {
      const { folders, imageFolders, folderPrefs, screenZones, ...rest } = preset || {};
      if (Array.isArray(folders) && folders.length && !(name in config.folderSets)) {
        config.folderSets[name] = {
          folders,
          imageFolders: Array.isArray(imageFolders) ? imageFolders : [],
          folderPrefs: folderPrefs && typeof folderPrefs === 'object' ? folderPrefs : {},
          screenZones: Array.isArray(screenZones) ? screenZones : [],
        };
        moved++;
      }
      presets[name] = rest;
    }
    config.presets = presets;
    config.folderSetsMigrated = true;
    if (moved) logger.log('CONFIG', `Moved the folders of ${moved} preset(s) into folder sets of the same name`);
  }
}

// Settings represent real work — folder lists, priorities, presets — so every
// save keeps the three previous versions beside it. Restoring is then a matter
// of renaming a file, whatever went wrong.
const CONFIG_BACKUPS = 3;

function rotateConfigBackups() {
  const base = configPath();
  try {
    if (!fs.existsSync(base)) return;
    for (let n = CONFIG_BACKUPS; n > 1; n--) {
      const older = `${base}.${n}`;
      const newer = `${base}.${n - 1}`;
      if (fs.existsSync(newer)) fs.copyFileSync(newer, older);
    }
    fs.copyFileSync(base, `${base}.1`);
  } catch (e) {
    logger.log('ERROR', 'config backup:', String(e));
  }
}

function saveConfig(rotateBackups = true) {
  try {
    // Losing the folder list is the one change that cannot be reconstructed
    // from anything else, so it is always worth a line in the log.
    const previous = readSavedConfig();
    if (previous && (previous.folders || []).length && !(config.folders || []).length) {
      logger.log('WARN', `Folder list went from ${previous.folders.length} to 0 — previous settings kept in ${path.basename(configPath())}.1`);
    }
    if (rotateBackups) rotateConfigBackups();
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (e) {
    logger.log('ERROR', 'saveConfig:', String(e));
  }
}

function readSavedConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (_) {
    return null;
  }
}

// ── Built-in presets ──────────────────────────────────────────────────────────
//
// Loading a preset merges it over the current settings, so each one spells out
// every setting it cares about — otherwise you would inherit leftovers from
// whatever was loaded before. Deliberately absent from all of them:
//   folders, folderPrefs   — your library and priorities are yours to keep
//   windowCount / span / blankUnusedScreens — these describe your monitors
//   minLength / maxLength  — a length filter could silently empty the wall
//   the file pickers (music, patterns, affirmations, countdown image)
//
// Bump PRESETS_VERSION to hand out newly added ones, and list each newcomer in
// BUILTIN_SINCE with that version: only presets newer than what a config has
// already been handed are added, so presets a user deleted stay deleted, and a
// user's own preset of the same name is never overwritten.
const PRESETS_VERSION = 2;
const BUILTIN_SINCE = { 'Centre stage': 2 }; // unlisted = version 1

const BUILTIN_PRESETS = {
  // Portrait clips side by side — phone-shaped footage, full height.
  'Vertical wall': {
    layoutMode: 'grid', gridCols: 4, gridRows: 1,
    heroCell: false, heroSpan: 2, heroPosition: 'top-left',
    orientation: 'vertical', replaceInPlace: true, edgeInserts: true,
    shuffle: true, folderRoundRobin: true, cooldownMinutes: 20, skipSeconds: 3,
    kenBurns: true, kenBurnsAmount: 5, kenBurnsSeconds: 45, kenBurnsRotate: 0,
    kenBurnsCenter: 'center', kenBurnsScope: 'tile',
    kenBurnsBeatSync: false, kenBurnsBeats: 16,
    volume: 80, normalizeAudio: true, normalizeTarget: 40, limiter: true,
    stereoPan: true, stereoPanAmount: 70,
    progressiveEnabled: false, breathingEnabled: false, textEnabled: false,
    goalEnabled: false, videoBeatSync: false, breathingBeatSync: false,
    hypnoCycle: false,
  },

  // One clip at a time, filling the screen. Nothing on top of it.
  'Single screen': {
    layoutMode: 'auto', minCols: 1, maxCols: 1, minRows: 1, maxRows: 1,
    heroCell: false,
    orientation: 'any', replaceInPlace: false, edgeInserts: false,
    shuffle: true, folderRoundRobin: true, cooldownMinutes: 45, skipSeconds: 0,
    kenBurns: false, kenBurnsAmount: 6, kenBurnsSeconds: 30, kenBurnsRotate: 0,
    kenBurnsCenter: 'center', kenBurnsScope: 'tile',
    kenBurnsBeatSync: false, kenBurnsBeats: 16,
    volume: 90, normalizeAudio: true, normalizeTarget: 45, limiter: true,
    stereoPan: false, stereoPanAmount: 60,
    progressiveEnabled: false, breathingEnabled: false, textEnabled: false,
    goalEnabled: false, videoBeatSync: false, breathingBeatSync: false,
    hypnoCycle: false,
  },

  // The classic adaptive wall: let the optimizer fit the clips' shapes.
  'Mosaic': {
    layoutMode: 'auto', minCols: 2, maxCols: 3, minRows: 1, maxRows: 2,
    heroCell: false,
    orientation: 'any', replaceInPlace: false, edgeInserts: true,
    shuffle: true, folderRoundRobin: true, cooldownMinutes: 30, skipSeconds: 3,
    kenBurns: true, kenBurnsAmount: 6, kenBurnsSeconds: 40, kenBurnsRotate: 0,
    kenBurnsCenter: 'random', kenBurnsScope: 'tile',
    kenBurnsBeatSync: false, kenBurnsBeats: 16,
    volume: 80, normalizeAudio: true, normalizeTarget: 40, limiter: true,
    stereoPan: true, stereoPanAmount: 50,
    progressiveEnabled: false, breathingEnabled: false, textEnabled: false,
    goalEnabled: false, videoBeatSync: false, breathingBeatSync: false,
    hypnoCycle: false,
  },

  // One big clip with satellites around it; the big one changes in place.
  'Hero focus': {
    layoutMode: 'grid', gridCols: 3, gridRows: 3,
    heroCell: true, heroSpan: 2, heroPosition: 'top-left',
    orientation: 'any', replaceInPlace: true, edgeInserts: false,
    shuffle: true, folderRoundRobin: true, cooldownMinutes: 30, skipSeconds: 3,
    kenBurns: true, kenBurnsAmount: 4, kenBurnsSeconds: 60, kenBurnsRotate: 0,
    kenBurnsCenter: 'crop', kenBurnsScope: 'tile',
    kenBurnsBeatSync: false, kenBurnsBeats: 16,
    volume: 80, normalizeAudio: true, normalizeTarget: 40, limiter: true,
    stereoPan: true, stereoPanAmount: 60,
    progressiveEnabled: false, breathingEnabled: false, textEnabled: false,
    goalEnabled: false, videoBeatSync: false, breathingBeatSync: false,
    hypnoCycle: false,
  },

  // Slow, quiet, hands-off: the whole wall breathes as one picture.
  'Ambient drift': {
    layoutMode: 'auto', minCols: 2, maxCols: 2, minRows: 1, maxRows: 2,
    heroCell: false,
    orientation: 'any', replaceInPlace: true, edgeInserts: false,
    shuffle: true, folderRoundRobin: true, cooldownMinutes: 60, skipSeconds: 5,
    kenBurns: true, kenBurnsAmount: 10, kenBurnsSeconds: 120, kenBurnsRotate: 2,
    kenBurnsCenter: 'center', kenBurnsScope: 'wall',
    kenBurnsBeatSync: false, kenBurnsBeats: 16,
    volume: 35, normalizeAudio: true, normalizeTarget: 25, limiter: true,
    stereoPan: true, stereoPanAmount: 40,
    progressiveEnabled: false, breathingEnabled: false, textEnabled: false,
    goalEnabled: false, videoBeatSync: false, breathingBeatSync: false,
    hypnoCycle: false,
  },

  // Load a track (or tap T) and the wall moves and re-tiles on the beat.
  'Beat-synced wall': {
    layoutMode: 'grid', gridCols: 3, gridRows: 2,
    heroCell: false, heroSpan: 2, heroPosition: 'top-left',
    orientation: 'any', replaceInPlace: true, edgeInserts: false,
    shuffle: true, folderRoundRobin: true, cooldownMinutes: 20, skipSeconds: 2,
    kenBurns: true, kenBurnsAmount: 15, kenBurnsSeconds: 30, kenBurnsRotate: 4,
    kenBurnsCenter: 'center', kenBurnsScope: 'wall',
    kenBurnsBeatSync: true, kenBurnsBeats: 16,
    volume: 75, normalizeAudio: true, normalizeTarget: 35, limiter: true,
    stereoPan: true, stereoPanAmount: 60,
    progressiveEnabled: false, breathingEnabled: false, textEnabled: false,
    goalEnabled: false, videoBeatSync: true, breathingBeatSync: false,
    hypnoCycle: false,
  },

  // The whole toolkit: starts on one tile and builds, with breathing, text and
  // the goal timer running. Press H at any point to bring the patterns in.
  'Deep trance': {
    layoutMode: 'auto', minCols: 2, maxCols: 3, minRows: 1, maxRows: 2,
    heroCell: false,
    orientation: 'any', replaceInPlace: false, edgeInserts: false,
    shuffle: true, folderRoundRobin: true, cooldownMinutes: 30, skipSeconds: 3,
    kenBurns: true, kenBurnsAmount: 12, kenBurnsSeconds: 60, kenBurnsRotate: 3,
    kenBurnsCenter: 'center', kenBurnsScope: 'wall',
    kenBurnsBeatSync: true, kenBurnsBeats: 32,
    volume: 60, normalizeAudio: true, normalizeTarget: 30, limiter: true,
    stereoPan: true, stereoPanAmount: 60,
    progressiveEnabled: true, progressiveMinutes: 20, progressiveStartTiles: 1,
    breathingEnabled: true, breathingIntervalMin: 8, breathsPerExercise: 5,
    inhaleSeconds: 4, holdSeconds: 4, exhaleSeconds: 6, holdAfterSeconds: 0,
    breathingSound: true, breathingBeatSync: true,
    textEnabled: true, textMode: 'beat-flash',
    hypnoCycle: true, hypnoCycleSeconds: 20, hypnoOpacity: 25,
    goalEnabled: true, goalCountdown: true, videoBeatSync: true,
  },

  // One clip holds the middle of the screen with a ring of smaller ones around
  // it; finished clips swap in place so the centre is never disturbed.
  'Centre stage': {
    layoutMode: 'center', centerSize: 50, surroundTiles: 8,
    heroCell: false,
    orientation: 'any', replaceInPlace: true, edgeInserts: false,
    shuffle: true, folderRoundRobin: true, cooldownMinutes: 30, skipSeconds: 3,
    kenBurns: true, kenBurnsAmount: 5, kenBurnsSeconds: 45, kenBurnsRotate: 0,
    kenBurnsCenter: 'center', kenBurnsScope: 'tile',
    kenBurnsBeatSync: false, kenBurnsBeats: 16,
    volume: 80, normalizeAudio: true, normalizeTarget: 40, limiter: true,
    stereoPan: true, stereoPanAmount: 60,
    progressiveEnabled: false, breathingEnabled: false, textEnabled: false,
    goalEnabled: false, videoBeatSync: false, breathingBeatSync: false,
    hypnoCycle: false,
  },
};

// Hand out any built-in the user has not seen yet. A preset they deleted stays
// deleted (the version flag has already moved past it), and one of their own
// with the same name is left untouched.
function seedBuiltinPresets() {
  const seeded = config.presetsSeeded || 0;
  if (seeded >= PRESETS_VERSION) return;
  const presets = { ...(config.presets || {}) };
  const added = [];
  for (const [name, values] of Object.entries(BUILTIN_PRESETS)) {
    if ((BUILTIN_SINCE[name] || 1) <= seeded) continue; // handed out before; may have been deleted since
    if (!(name in presets)) { presets[name] = values; added.push(name); }
  }
  config.presets = presets;
  config.presetsSeeded = PRESETS_VERSION;
  logger.log('CONFIG', added.length ? `Added built-in presets: ${added.join(', ')}` : 'Built-in presets already present');
  saveConfig();
}

// ── Control window ──────────────────────────────────────────────────────────

function createControlWindow() {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.focus();
    return;
  }
  controlWin = new BrowserWindow({
    width: 680,
    height: 800,
    backgroundColor: '#0f1420',
    title: 'GoonTiles',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'controls-preload.js'),
      contextIsolation: true,
    },
  });
  controlWin.loadFile('controls.html').catch((e) => logger.log('ERROR', 'controls loadFile:', String(e)));
  controlWin.setMenuBarVisibility(false);
  controlWin.on('closed', () => {
    controlWin = null;
    quitWhenNothingVisible();
  });

  // Drop any always-on-top players (span mode) so the controls aren't hidden behind them.
  for (const w of windows) {
    if (!w.isDestroyed()) { try { w.setAlwaysOnTop(false); } catch (_) {} }
  }
  controlWin.setAlwaysOnTop(true);
  controlWin.focus();
}

// ── Player windows ────────────────────────────────────────────────────────────

function unionBounds(displays) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x);
    minY = Math.min(minY, d.bounds.y);
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// mode: 'fullscreen' (per-monitor OS fullscreen) | 'span' (borderless, covers
// multiple monitors via always-on-top — native fullscreen can't span screens).
function makePlayerWindow(bounds, mode, index = 0) {
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    fullscreen: mode === 'fullscreen',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: false,
      autoplayPolicy: 'no-user-gesture-required', // allow unmuted autoplay
      backgroundThrottling: false, // keep playing full-speed even when not focused
    },
  });

  win.loadFile('renderer.html').catch((e) => logger.log('FATAL', 'renderer loadFile:', String(e)));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    if (mode === 'span') {
      // Reassert exact union bounds and float above the taskbar(s).
      win.setBounds(bounds);
      win.setAlwaysOnTop(true, 'screen-saver');
    } else if (!win.isFullScreen()) {
      win.setFullScreen(true);
    }
    const b = win.getBounds();
    logger.log('WIN', `Window ${win.id} mode=${mode} bounds=${b.width}x${b.height} fs=${win.isFullScreen()}`);
  });

  // Closing the window directly (Alt+F4, or a WM_CLOSE from outside) would take
  // its recorder down with it mid-chunk, so hold the close open the same way the
  // quit does. Destroying a window skips this, which is what a restart wants.
  win.on('close', (e) => {
    if (!openRecordings.size || restarting) return;
    e.preventDefault();
    finishRecordings('window closed').then(() => {
      if (!win.isDestroyed()) win.destroy();
    });
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    logger.log('RENDERER', 'render-process-gone:', JSON.stringify(details));
  });
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const levels = ['LOG', 'WARN', 'ERROR', 'INFO'];
    logger.log('CONSOLE', `[${levels[level] || level}] ${message} (${sourceId}:${line})`);
  });

  const zone = zoneFor(index);
  if (zone.length) logger.log('WIN', `Window ${win.id} zoned to: ${zone.map((f) => path.basename(f)).join(', ')}`);
  windowStates.set(win.id, {
    display: bounds, ready: false, active: [], relayoutChain: Promise.resolve(),
    index, zone, queueIndex: 0,
  });
  win.on('closed', () => {
    logger.log('WIN', `Window ${win.id} closed`);
    windowStates.delete(win.id);
    windows = windows.filter((w) => w !== win);
    quitWhenNothingVisible();
  });
  windows.push(win);
  return win;
}

function createWindows() {
  const displays = screen.getAllDisplays();

  // Span mode: a single window stretched across every monitor.
  if (config.spanAllScreens && displays.length > 1) {
    const u = unionBounds(displays);
    logger.log('WIN', `Span mode: one ${u.width}x${u.height} window across ${displays.length} displays`);
    makePlayerWindow(u, 'span', 0);
    return;
  }

  const count = config.windowCount > 0 ? config.windowCount : displays.length;
  logger.log('WIN', `Found ${displays.length} display(s); creating ${count} window(s)`);

  const usedDisplayIds = new Set();
  for (let i = 0; i < count; i++) {
    const display = displays[i % displays.length]; // wrap onto screens if count > displays
    usedDisplayIds.add(display.id);
    makePlayerWindow(display.bounds, 'fullscreen', i);
  }

  // Cover any screens without a player window in black.
  if (config.blankUnusedScreens) {
    for (const display of displays) {
      if (!usedDisplayIds.has(display.id)) createBlankWindow(display);
    }
  }
}

function closeAllPlayerWindows() {
  stopBreathingScheduler();
  stopAffirmations();
  persistGoalBest();
  stopGoalTimer();
  stopProgressiveRamp();
  progressiveT0 = 0;
  recordSession();
  // Anything still open here has lost its renderer, so it can only be closed as
  // it stands — finishRecordings() is the graceful path and runs before this.
  forceCloseRecordings('player window closed');
  for (const w of [...windows, ...blankWindows]) {
    if (!w.isDestroyed()) w.destroy();
  }
  windows = [];
  blankWindows = [];
  windowStates.clear();
}

// ── Music window ──────────────────────────────────────────────────────────────

function createAudioWindow() {
  audioWin = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });
  audioWin.loadFile('audio.html').catch((e) => logger.log('ERROR', 'audio loadFile:', String(e)));
}

function sendMusic(channel, data) {
  if (audioReady && audioWin && !audioWin.isDestroyed()) {
    audioWin.webContents.send(channel, data);
  } else {
    pendingMusic = { channel, data };
  }
}

function applyMusicState() {
  if (config.musicEnabled && config.musicFile) {
    // Pick the track up where it was left last time, as long as it is the same one.
    const same = musicPosition && musicPosition.file === config.musicFile;
    const offset = same ? Math.max(0, +musicPosition.seconds || 0) : 0;
    if (offset) logger.log('AUDIO', `music resumes at ${Math.round(offset)}s`);
    sendMusic('play-music', { path: config.musicFile, offset });
  } else {
    sendMusic('stop-music', {});
  }
}

// Where the music track was last heard, kept in a small file of its own: it
// changes every few seconds, and config.json is backed up on every write.
function musicPositionPath() {
  return path.join(app.getPath('userData'), 'music-position.json');
}

function loadMusicPosition() {
  try {
    const saved = JSON.parse(fs.readFileSync(musicPositionPath(), 'utf8'));
    if (saved && typeof saved.file === 'string' && Number.isFinite(saved.seconds)) {
      musicPosition = { file: saved.file, seconds: saved.seconds };
    }
  } catch (_) { /* nothing saved yet */ }
}

function saveMusicPosition() {
  if (!musicPosition) return;
  try {
    fs.writeFileSync(musicPositionPath(), JSON.stringify(musicPosition));
    musicPositionSavedAt = Date.now();
  } catch (e) {
    logger.log('ERROR', 'music position:', String(e));
  }
}

// ── Breathing exercise ────────────────────────────────────────────────────────

function broadcastPlayers(channel, data) {
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}

function breathingParams() {
  // When beat-synced, the phase numbers count beats; convert to seconds via the
  // current tempo (sampled at exercise start).
  const mul = config.breathingBeatSync ? (60 / (tempoBpm || 60)) : 1;
  return {
    breaths: Math.max(1, config.breathsPerExercise | 0),
    inhale: Math.max(0, +config.inhaleSeconds || 0) * mul,
    hold: Math.max(0, +config.holdSeconds || 0) * mul,
    exhale: Math.max(0, +config.exhaleSeconds || 0) * mul,
    holdAfter: Math.max(0, +config.holdAfterSeconds || 0) * mul,
    sound: !!config.breathingSound,
  };
}

function countdownFields() {
  return { image: selectedPoppersImage(), cdx: config.countdownX, cdy: config.countdownY, cdh: config.countdownHeight };
}

function poppersCatalog() {
  return POPPERS_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    available: fs.existsSync(path.join(__dirname, 'poppers', option.file)),
    file: option.file,
  }));
}

function selectedPoppersImage() {
  const selected = POPPERS_OPTIONS.find((option) => option.id === config.poppersBrand);
  const candidates = [selected, ...POPPERS_OPTIONS].filter(Boolean);
  for (const option of candidates) {
    const file = path.join(__dirname, 'poppers', option.file);
    if (fs.existsSync(file)) return file;
  }
  return '';
}

function startBreathingScheduler() {
  stopBreathingScheduler();
  if (!config.breathingEnabled) return;
  const intervalMs = Math.max(5, (+config.breathingIntervalMin || 10) * 60) * 1000;
  breathingIntervalMs = intervalMs;
  breathingNextAt = Date.now() + intervalMs;
  broadcastPlayers('breathing-schedule', { nextAt: breathingNextAt, intervalMs, ...countdownFields() });
  breathingTimer = setTimeout(triggerBreathingExercise, intervalMs);
  logger.log('BREATHE', `next exercise in ${Math.round(intervalMs / 1000)}s`);
  armNarrationLeadIn();
}

function stopBreathingScheduler() {
  clearTimeout(breathingTimer); breathingTimer = null;
  clearTimeout(breathingEndTimer); breathingEndTimer = null;
  breathingActive = false;
  breathingNextAt = 0;
  if (narrationLeadTimer) { clearTimeout(narrationLeadTimer); narrationLeadTimer = null; }
}

function triggerBreathingExercise(aligned) {
  // When beat-synced, wait for the next beat so the exercise lands on the grid.
  if (config.breathingBeatSync && !aligned) {
    const d = msToNextBeat();
    breathingTimer = setTimeout(() => triggerBreathingExercise(true), d > 20 ? d : 0);
    return;
  }
  const p = breathingParams();
  breathingActive = true;
  stopNarration(); // the exercise takes over from the voice
  broadcastPlayers('breathing-start', p);
  const perBreath = p.inhale + p.hold + p.exhale + p.holdAfter;
  const totalMs = Math.max(1, p.breaths * perBreath) * 1000;
  logger.log('BREATHE', `exercise: ${p.breaths} breaths, ~${Math.round(totalMs / 1000)}s`);
  breathingEndTimer = setTimeout(() => {
    breathingActive = false;
    broadcastPlayers('breathing-end', {});
    startBreathingScheduler();
  }, totalMs + 600);
}

// ── Tempo clock ───────────────────────────────────────────────────────────────

function broadcastTempo() {
  broadcastPlayers('tempo', { bpm: tempoBpm, t0: tempoT0 });
}

// ── Hypnosis patterns (video) + text overlay ──────────────────────────────────

function patternFiles() {
  const dir = (config.patternFolder && fs.existsSync(config.patternFolder))
    ? config.patternFolder : path.join(__dirname, 'patterns');
  try {
    return fs.readdirSync(dir)
      .filter((f) => VIDEO_EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => path.join(dir, f));
  } catch (_) { return []; }
}

function currentPatternPath() {
  const files = patternFiles();
  if (!files.length) return '';
  return files[((hypnoIndex % files.length) + files.length) % files.length];
}

function hypnoPayload(show) {
  return { show, src: currentPatternPath(), opacity: effectiveHypnoOpacity() };
}

function advanceHypnoPattern() {
  hypnoIndex++;
  broadcastPlayers('hypno', hypnoPayload(hypnoShown));
}

function affirmationClips() {
  const dir = config.affirmationFolder;
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter((f) => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => ({ path: path.join(dir, f), word: path.basename(f, path.extname(f)) }));
  } catch (_) { return []; }
}

function affirmationsActive() {
  return textShown && !!config.affirmationFolder && affirmationClips().length > 0;
}

function textPayload(show) {
  const clips = affirmationClips();
  const affirmations = show && affirmationsActive();
  const lines = affirmations
    ? clips.map((c) => c.word)
    : (Array.isArray(config.hypnoLines) && config.hypnoLines.length ? config.hypnoLines : [config.hypnoText]);
  return { show, lines, mode: config.textMode, affirmations };
}

// ── Affirmation audio (ducked) ─────────────────────────────────────────────────

function setDuck(on) {
  const f = on ? 0.5 : 1; // gentle ~50% duck
  broadcastPlayers('duck', { factor: f });
  sendMusic('duck-music', { factor: f });
}

function startAffirmations() {
  stopAffirmations();
  if (!affirmationsActive()) return;
  affirmationTimer = setTimeout(playNextAffirmation, 800);
}

function stopAffirmations() {
  if (affirmationTimer) { clearTimeout(affirmationTimer); affirmationTimer = null; }
}

function playNextAffirmation() {
  if (!affirmationsActive()) return;
  const clips = affirmationClips();
  const clip = clips[Math.floor(Math.random() * clips.length)];
  logger.log('AFFIRM', `play: ${clip.word}`);
  broadcastPlayers('affirmation', { word: clip.word });
  setDuck(true);
  sendMusic('play-affirmation', { path: clip.path });
}

function onAffirmationEnded() {
  broadcastPlayers('affirmation', { word: '' });
  setDuck(false);
  if (affirmationsActive()) {
    affirmationTimer = setTimeout(playNextAffirmation, 1500 + Math.random() * 1500); // gap between clips
  }
}

// ── Narration + countdown sound ───────────────────────────────────────────────
//
// Both are "cues": whole clips the audio window decodes once and plays on
// request, at full volume over a ducked wall. A narration also carries its
// spoken lines, read from the .json the hypnosis studio writes beside the WAV,
// so the players can flash each word as it is said.

function cueFiles() {
  return [config.narrationFile, config.goalCountdownSound].filter((f) => f && fs.existsSync(f));
}

// Ask the audio window to decode the cues, so they start instantly later and
// so their lengths are known for end-aligned scheduling.
function loadCues() {
  for (const file of cueFiles()) sendMusic('load-cue', { path: file });
}

// The timing sidecar: <voice>.json next to <voice>.wav, with a `lines` list of
// { t, end, text } for every spoken segment.
const sidecarCache = new Map(); // sidecar path → { mtime, lines }

function narrationSidecarPath(file) {
  return file ? file.replace(/\.[^./\\]+$/, '') + '.json' : '';
}

function narrationLines(file) {
  const side = narrationSidecarPath(file);
  if (!side) return [];
  let mtime = 0;
  try { mtime = fs.statSync(side).mtimeMs; } catch (_) { return []; }
  const hit = sidecarCache.get(side);
  if (hit && hit.mtime === mtime) return hit.lines;
  let lines = [];
  try {
    const data = JSON.parse(fs.readFileSync(side, 'utf8'));
    lines = (Array.isArray(data.lines) ? data.lines : [])
      .map((l) => ({ t: +l.t, end: +l.end, text: String(l.text || '').trim() }))
      .filter((l) => Number.isFinite(l.t) && Number.isFinite(l.end) && l.end > l.t && l.text)
      .sort((a, b) => a.t - b.t);
  } catch (e) {
    logger.log('NARRATE', `could not read ${path.basename(side)}: ${String(e)}`);
  }
  sidecarCache.set(side, { mtime, lines });
  return lines;
}

function narrationPayload() {
  if (!narrationActive) return { show: false };
  return {
    show: true,
    lines: config.narrationText ? narrationLines(config.narrationFile) : [],
    startedAt: narrationActive.startedAt,
    offset: narrationActive.offset,
  };
}

function startNarration(reason, offset = 0) {
  const file = config.narrationFile;
  if (!file || narrationActive || !fs.existsSync(file)) return;
  stopAffirmations(); // one voice at a time
  narrationActive = { startedAt: Date.now(), offset: Math.max(0, offset) };
  setDuck(true);
  sendMusic('play-cue', { id: 'narration', path: file, offset: narrationActive.offset });
  broadcastPlayers('narration', narrationPayload());
  logger.log('NARRATE', `${reason}: ${path.basename(file)}${offset ? ` from ${Math.round(offset)}s` : ''}`);
}

function stopNarration() {
  if (!narrationActive) return;
  sendMusic('stop-cue', { id: 'narration' });
  endNarration();
}

function endNarration() {
  if (!narrationActive) return;
  narrationActive = null;
  broadcastPlayers('narration', { show: false });
  setDuck(goalSoundPlaying);
  if (affirmationsActive()) startAffirmations();
}

function clearNarrationTimers() {
  if (narrationStartTimer) { clearTimeout(narrationStartTimer); narrationStartTimer = null; }
  if (narrationLeadTimer) { clearTimeout(narrationLeadTimer); narrationLeadTimer = null; }
}

// Time the lead-in so its last word lands as the breathing countdown reaches
// zero. If the countdown is already shorter than the clip, start part-way in.
function armNarrationLeadIn() {
  if (narrationLeadTimer) { clearTimeout(narrationLeadTimer); narrationLeadTimer = null; }
  const file = config.narrationFile;
  if (!config.narrationBeforeBreathing || !file || !breathingNextAt || breathingActive) return;
  const dur = cueDurations.get(file);
  if (!dur) return; // armed again once the audio window reports the length
  const startAt = breathingNextAt - dur * 1000;
  const now = Date.now();
  if (startAt <= now) {
    const offset = (now - startAt) / 1000;
    if (offset < dur - 1) startNarration('lead-in', offset);
    return;
  }
  narrationLeadTimer = setTimeout(() => { narrationLeadTimer = null; startNarration('lead-in'); }, startAt - now);
  logger.log('NARRATE', `lead-in in ${Math.round((startAt - now) / 1000)}s (clip ${Math.round(dur)}s)`);
}

// The goal countdown sound ends exactly as the target is reached.
function armGoalSound() {
  if (goalSoundTimer) { clearTimeout(goalSoundTimer); goalSoundTimer = null; }
  const file = config.goalCountdownSound;
  if (!config.goalEnabled || !file || !goalSessionStart || !(goalTarget > 0) || goalSoundPlaying) return;
  const dur = cueDurations.get(file);
  if (!dur) return;
  const endAt = goalSessionStart + goalTarget * 1000;
  const startAt = endAt - dur * 1000;
  const now = Date.now();
  if (startAt <= now) {
    if (endAt - now > 500) playGoalSound((now - startAt) / 1000);
    return;
  }
  goalSoundTimer = setTimeout(() => { goalSoundTimer = null; playGoalSound(0); }, startAt - now);
}

function playGoalSound(offset) {
  goalSoundPlaying = true;
  setDuck(true);
  sendMusic('play-cue', { id: 'goal', path: config.goalCountdownSound, offset });
  logger.log('GOAL', `countdown sound: ${path.basename(config.goalCountdownSound)}`);
}

function onCueEnded(id) {
  if (id === 'narration') endNarration();
  else if (id === 'goal') { goalSoundPlaying = false; setDuck(!!narrationActive); }
}

function startHypnoCycle() {
  stopHypnoCycle();
  if (!hypnoShown || !config.hypnoCycle) return;
  const sec = Math.max(4, +config.hypnoCycleSeconds || 20);
  hypnoCycleTimer = setInterval(advanceHypnoPattern, sec * 1000);
}

function stopHypnoCycle() {
  if (hypnoCycleTimer) { clearInterval(hypnoCycleTimer); hypnoCycleTimer = null; }
}

// ── Meditation goal timer ─────────────────────────────────────────────────────

function goalPayload() {
  return {
    enabled: config.goalEnabled,
    countdown: config.goalCountdown,
    start: goalSessionStart,
    target: goalTarget,
    targetIsGoal: (+config.goalMinutes || 0) > 0,
  };
}

function goalElapsed() {
  return goalSessionStart ? (Date.now() - goalSessionStart) / 1000 : 0;
}

function startGoalTimer() {
  stopGoalTimer();
  goalSessionStart = Date.now();
  // Target: a fixed goal time if set, otherwise the personal best to beat.
  goalTarget = config.goalEnabled
    ? ((+config.goalMinutes || 0) > 0 ? config.goalMinutes * 60 : (+config.personalBest || 0))
    : 0;
  broadcastPlayers('goal', goalPayload());
  if (!config.goalEnabled) return;
  armGoalSound();
  goalSaveTick = 0;
  goalTimer = setInterval(() => {
    const e = goalElapsed();
    if (e > (config.personalBest || 0)) config.personalBest = e; // new record in progress
    if (++goalSaveTick % 20 === 0) saveConfig(); // persist every ~20s
  }, 1000);
}

function stopGoalTimer() {
  if (goalTimer) { clearInterval(goalTimer); goalTimer = null; }
  if (goalSoundTimer) { clearTimeout(goalSoundTimer); goalSoundTimer = null; }
}

function persistGoalBest() {
  if (!config.goalEnabled || !goalSessionStart) return;
  const e = goalElapsed();
  if (e > (config.personalBest || 0)) config.personalBest = e;
  saveConfig();
}

// Milliseconds until the next beat boundary on the shared clock.
function msToNextBeat() {
  if (!tempoBpm) return 0;
  const beatMs = 60000 / tempoBpm;
  const into = (((Date.now() - tempoT0) % beatMs) + beatMs) % beatMs;
  return beatMs - into;
}

// Smoothly ramp toward a new BPM. Each step recomputes t0 so the beat phase stays
// continuous (no position jump) while the frequency eases — windows stay in sync
// because they all evaluate beats = (now - t0)*bpm/60000 against the same clock.
function setTempo(bpm) {
  tempoTargetBpm = Math.min(240, Math.max(20, bpm));
  config.bpm = Math.round(tempoTargetBpm);
  saveConfig();
  if (tempoRamp) return;
  tempoRamp = setInterval(() => {
    const now = Date.now();
    const beats = (now - tempoT0) * tempoBpm / 60000;
    let next = tempoBpm + (tempoTargetBpm - tempoBpm) * 0.2;
    if (Math.abs(next - tempoTargetBpm) < 0.1) next = tempoTargetBpm;
    tempoBpm = next;
    tempoT0 = now - (beats * 60000 / tempoBpm); // preserve phase across the change
    broadcastTempo();
    if (tempoBpm === tempoTargetBpm) { clearInterval(tempoRamp); tempoRamp = null; }
  }, 50);
}

function resetTempo() {
  tempoBpm = tempoTargetBpm = Math.min(240, Math.max(20, +config.bpm || 60));
  tempoT0 = Date.now();
  if (tempoRamp) { clearInterval(tempoRamp); tempoRamp = null; }
  tapTimes = [];
  rhythmShown = false;
  hypnoShown = false;
  hypnoIndex = 0;
  textShown = false;
  stopHypnoCycle();
}

function handleTap() {
  const now = Date.now();
  if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2000) tapTimes = [];
  tapTimes.push(now);
  if (tapTimes.length > 6) tapTimes.shift();
  if (tapTimes.length >= 3) {
    let sum = 0;
    for (let i = 1; i < tapTimes.length; i++) sum += tapTimes[i] - tapTimes[i - 1];
    const bpm = 60000 / (sum / (tapTimes.length - 1));
    setTempo(bpm);
    logger.log('TEMPO', `tap → ${Math.round(bpm)} bpm`);
  }
}

function skipBreathingExercise() {
  if (!breathingActive) return;
  logger.log('BREATHE', 'exercise skipped');
  clearTimeout(breathingEndTimer); breathingEndTimer = null;
  breathingActive = false;
  broadcastPlayers('breathing-end', {});
  startBreathingScheduler();
}

function createBlankWindow(display) {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    fullscreen: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  win.loadFile('blank.html').catch((e) => logger.log('ERROR', 'blank loadFile:', String(e)));
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => { if (!win.isFullScreen()) win.setFullScreen(true); });
  win.on('closed', () => { blankWindows = blankWindows.filter((w) => w !== win); });
  blankWindows.push(win);
  logger.log('WIN', `Blank window on display ${display.id}`);
}

// ── Dimension probing ─────────────────────────────────────────────────────────

function createProbeWindow() {
  probeWin = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'prober-preload.js'),
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });
  probeWin.loadFile('prober.html').catch((e) => logger.log('ERROR', 'prober loadFile:', String(e)));
}

function whenProbeReady() {
  if (probeReady) return Promise.resolve();
  return new Promise((resolve) => probeReadyWaiters.push(resolve));
}

async function probeDims(paths) {
  const need = [...new Set(paths.filter((p) => !dimsCache.has(p)))];
  if (need.length === 0) return;

  await whenProbeReady();

  const requestId = ++probeRequestSeq;
  const result = await new Promise((resolve) => {
    pendingProbes.set(requestId, resolve);
    probeWin.webContents.send('probe', { requestId, paths: need });
  });

  for (const r of result) {
    dimsCache.set(r.path, { width: r.width, height: r.height, duration: r.duration });
  }
}

// Does this (already-probed) video fall within the configured length range?
// Unknown duration (probe failed) passes so we don't silently drop files.
function inLengthRange(filePath) {
  if (isImageFile(filePath)) return true; // a still has no length to filter on
  const d = dimsCache.get(filePath);
  if (!d || d.duration == null) return true;
  const min = config.minLength || 0;
  const max = (!config.maxLength || config.maxLength >= LENGTH_MAX) ? Infinity : config.maxLength;
  return d.duration >= min && d.duration <= max;
}

// ── Folder preferences ────────────────────────────────────────────────────────

function normPath(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

// Preference level for a file: the deepest configured ancestor folder wins, so
// a boost on Marvel/Phase-3 overrides a plain Marvel entry.
function prefLevelFor(filePath) {
  const prefs = config.folderPrefs || {};
  const f = normPath(filePath);
  let bestLen = -1;
  let level = 0;
  for (const key of Object.keys(prefs)) {
    const k = normPath(key);
    if (f === k || f.startsWith(k + '/')) {
      if (k.length > bestLen) { bestLen = k.length; level = prefs[key] || 0; }
    }
  }
  return level;
}

// Set (or clear) a folder's level and return the new one. Asking for the level
// it already has turns it off, so the tile buttons behave as plain toggles.
function setFolderPref(folder, want) {
  if (!folder) return 0;
  const prefs = { ...(config.folderPrefs || {}) };
  const key = Object.keys(prefs).find((k) => normPath(k) === normPath(folder)) || folder;
  const current = prefs[key] || 0;
  const level = current === want ? 0 : Math.max(PREF_AVOID, Math.min(PREF_PREFER, want));
  if (level === 0) delete prefs[key]; else prefs[key] = level;
  config.folderPrefs = prefs;
  saveConfig();
  return level;
}

// Rebuild the queue around the folder preferences: preferred clips come first
// so they play next, avoided ones go to the very back. Everything else keeps the
// order it had, starting from wherever the cursor currently sits — so this
// re-sorts what is coming up rather than restarting the library.
function applyPreferenceOrder() {
  if (mediaQueue.length === 0) return { preferred: 0, avoided: 0 };
  const from = globalQueueIndex % mediaQueue.length;
  const upcoming = [...mediaQueue.slice(from), ...mediaQueue.slice(0, from)];

  const preferred = [];
  const normal = [];
  const avoided = [];
  for (const item of upcoming) {
    const level = prefLevelFor(item.path);
    if (level > 0) preferred.push(item);
    else if (level < 0) avoided.push(item);
    else normal.push(item);
  }
  mediaQueue = [...preferred, ...normal, ...avoided];
  globalQueueIndex = 0;
  for (const state of windowStates.values()) state.queueIndex = 0;
  return { preferred: preferred.length, avoided: avoided.length };
}

// The folder path shown on a tile: rooted at the watched folder's own name so
// "…/Movies/Marvel/Phase 3" reads as "Movies / Marvel / Phase 3".
function folderLabelFor(dir) {
  let root = '';
  for (const f of watchedFolders) {
    if (normPath(dir).startsWith(normPath(f)) && f.length > root.length) root = f;
  }
  if (!root) return dir;
  const rel = path.relative(root, dir);
  return [path.basename(root), ...(rel ? rel.split(path.sep) : [])].filter(Boolean).join(' / ');
}

function folderInfoFor(filePath) {
  const dir = path.dirname(filePath);
  return { folder: dir, folderLabel: folderLabelFor(dir), prefLevel: prefLevelFor(filePath) };
}

// Resolution floor, as a stand-in for quality: anything whose shorter side is
// under the limit is skipped. Unknown dimensions pass, so a failed probe doesn't
// silently drop a file.
function inQualityRange(filePath) {
  if (!config.qualityFilter) return true;
  const min = config.minHeight || 0;
  if (min <= 0) return true;
  const d = dimsCache.get(filePath);
  if (!d || !d.width || !d.height) return true;
  return Math.min(d.width, d.height) >= min;
}

// Is this clip in the set of folders zoned to a particular screen? An empty
// zone means the screen draws from the whole library.
function inZone(filePath, zone) {
  if (!zone || zone.length === 0) return true;
  const f = normPath(filePath);
  return zone.some((dir) => {
    const k = normPath(dir);
    return f === k || f.startsWith(k + '/');
  });
}

// The folders zoned to the nth player window.
function zoneFor(index) {
  const zones = config.screenZones || [];
  const z = zones[index];
  return Array.isArray(z) ? z.filter(Boolean) : [];
}

// Does this (already-probed) video match the configured shape filter?
// Unknown dimensions pass so a failed probe doesn't silently drop a file.
function orientationOk(filePath, mode) {
  const m = mode || config.orientation || 'any';
  if (m === 'any') return true;
  const d = dimsCache.get(filePath);
  if (!d || !d.width || !d.height) return true;
  return m === 'vertical' ? d.height > d.width : d.width >= d.height;
}

// Every path currently on a tile, in any window — a clip should not appear
// twice on the wall at once.
function pathsOnScreen() {
  const set = new Set();
  for (const win of windows) {
    const state = windowStates.get(win.id);
    if (state) for (const a of state.active) set.add(a.item.path);
  }
  return set;
}

// Was this clip shown too recently to show again?
function inCooldown(filePath, now) {
  const mins = config.cooldownMinutes || 0;
  if (mins <= 0) return false;
  const at = recentlyPlayed.get(filePath);
  return at != null && now - at < mins * 60000;
}

// Remember that a clip just went on screen (and forget entries old enough that
// they can no longer block anything).
function markPlayed(filePath) {
  const now = Date.now();
  recentlyPlayed.set(filePath, now);
  if (recentlyPlayed.size > 4000) {
    const cutoff = now - Math.max(1, config.cooldownMinutes || 0) * 60000;
    for (const [p, at] of recentlyPlayed) if (at < cutoff) recentlyPlayed.delete(p);
  }
}

// Scan forward from a queue cursor, probing in chunks, collecting up to `count`
// items that pass the filters. Bounded by a scan cap so a strict filter over a
// huge library can't run away.
//
// Folder preferences are not applied here — they have already been baked into
// the queue order by applyPreferenceOrder(), so scanning forward naturally
// reaches preferred clips first and avoided ones last. What is left is the
// graceful-degradation ladder: take clean candidates first, then ones still in
// cooldown, then the wrong shape, and finally — only if there is genuinely
// nothing else — a clip already playing elsewhere. Returns [{ item, offset }].
async function gatherInRange(count, opts = {}) {
  if (count <= 0 || mediaQueue.length === 0) return [];
  const cursor = (opts.cursor == null ? globalQueueIndex : opts.cursor) % mediaQueue.length;
  const scanCap = Math.min(mediaQueue.length, 800);
  const now = Date.now();
  const onScreen = pathsOnScreen();

  const out = [];        // passed everything
  const cooling = [];    // played too recently
  const wrongShape = []; // rejected only by the orientation filter
  const duplicate = [];  // already on a tile somewhere
  let offset = 0;

  while (offset < scanCap && out.length < count) {
    const chunk = [];
    for (let j = 0; j < 32 && offset + j < scanCap; j++) {
      chunk.push(mediaQueue[(cursor + offset + j) % mediaQueue.length].path);
    }
    await probeDims(chunk);
    for (let j = 0; j < chunk.length && out.length < count; j++) {
      const off = offset + j;
      const item = mediaQueue[(cursor + off) % mediaQueue.length];
      if (!inLengthRange(item.path)) continue;
      if (!inQualityRange(item.path)) continue;
      if (!inZone(item.path, opts.zone)) continue;
      const entry = { item: itemWithDims(item), offset: off };
      if (onScreen.has(item.path)) { duplicate.push(entry); continue; }
      if (!orientationOk(item.path, opts.orientation)) { wrongShape.push(entry); continue; }
      if (inCooldown(item.path, now)) { cooling.push(entry); continue; }
      out.push(entry);
    }
    offset += chunk.length;
  }

  const drawFrom = (bucket) => {
    for (const e of bucket) { if (out.length >= count) break; out.push(e); }
  };
  drawFrom(cooling);
  if (out.length === 0) drawFrom(wrongShape);
  if (out.length === 0) drawFrom(duplicate);
  // Keep queue order so the cursor still advances monotonically.
  out.sort((a, b) => a.offset - b.offset);
  return out;
}

// Advance a queue cursor to just past the given offset. Zoned windows keep their
// own cursor so scanning past another screen's folders doesn't drag the shared
// one along with it.
function advanceQueue(offset, state) {
  if (!mediaQueue.length) return;
  if (state && state.zone && state.zone.length) {
    state.queueIndex = ((state.queueIndex || 0) + offset + 1) % mediaQueue.length;
  } else {
    globalQueueIndex = (globalQueueIndex + offset + 1) % mediaQueue.length;
  }
}

// Where a window should start scanning from.
function cursorFor(state) {
  return (state && state.zone && state.zone.length) ? (state.queueIndex || 0) : globalQueueIndex;
}

// Pick the next single in-range item and consume it.
async function pickNextInRange(opts = {}, state = null) {
  const g = await gatherInRange(1, { ...opts, cursor: cursorFor(state), zone: state && state.zone });
  if (g.length === 0) return null;
  advanceQueue(g[0].offset, state);
  return g[0].item;
}

// How many tiles ring the centre in the centre + surround layout.
function surroundCount() {
  return Math.max(4, Math.min(CENTER_MAX_SURROUND, Math.round(+config.surroundTiles) || 8));
}

// How many tiles a window may hold — a forced grid or a centre ring sets its
// own ceiling.
function tileCap() {
  if (config.layoutMode === 'grid') {
    const n = Math.max(1, config.gridCols || 1) * Math.max(1, config.gridRows || 1);
    return Math.max(1, Math.min(MAX_GRID_TILES, n));
  }
  if (config.layoutMode === 'center') return 1 + surroundCount();
  return MAX_ACTIVE_TILES;
}

// ── Progressive intensity ─────────────────────────────────────────────────────
//
// Ease the wall up over the first stretch of a session: start on a handful of
// tiles with the pattern overlay barely there, and grow to the full settings.

// 0..1 through the ramp (1 whenever the ramp is off or already finished).
function progressiveFraction() {
  if (!config.progressiveEnabled || !progressiveT0) return 1;
  const ms = Math.max(1, (config.progressiveMinutes || 0) * 60000);
  return Math.min(1, (Date.now() - progressiveT0) / ms);
}

function effectiveTileCap() {
  const full = tileCap();
  if (!config.progressiveEnabled || !progressiveT0) return full;
  const start = Math.max(1, Math.min(config.progressiveStartTiles || 1, full));
  return Math.max(start, Math.round(start + (full - start) * progressiveFraction()));
}

function effectiveHypnoOpacity() {
  const full = config.hypnoOpacity;
  if (!config.progressiveEnabled || !progressiveT0) return full;
  return Math.max(1, Math.round(full * progressiveFraction()));
}

function startProgressiveRamp() {
  stopProgressiveRamp();
  if (!config.progressiveEnabled) return;
  progressiveT0 = Date.now();
  let lastCap = effectiveTileCap();
  logger.log('RAMP', `progressive intensity over ${config.progressiveMinutes}min, from ${lastCap} tile(s)`);
  progressiveTimer = setInterval(() => {
    const cap = effectiveTileCap();
    if (cap !== lastCap) {
      lastCap = cap;
      logger.log('RAMP', `tile cap → ${cap}`);
      for (const win of windows) relayout(win);
    }
    if (hypnoShown) broadcastPlayers('hypno', hypnoPayload(true));
    if (progressiveFraction() >= 1) {
      logger.log('RAMP', 'full intensity reached');
      stopProgressiveRamp();
      progressiveT0 = 0; // from here on the configured values apply as-is
    }
  }, 5000);
}

function stopProgressiveRamp() {
  if (progressiveTimer) { clearInterval(progressiveTimer); progressiveTimer = null; }
}

// ── Session history ───────────────────────────────────────────────────────────

// Close out the running session and append it to the history graph.
function recordSession() {
  if (!playbackStartedAt) return;
  const seconds = Math.round((Date.now() - playbackStartedAt) / 1000);
  playbackStartedAt = 0;
  if (seconds < 30) {
    flushHistorySave();
    return; // ignore accidental starts
  }
  const history = [...(config.sessionHistory || []), { at: Date.now(), seconds }];
  config.sessionHistory = history.slice(-HISTORY_MAX);
  clearTimeout(historySaveTimer);
  historySaveTimer = null;
  saveConfig();
  notifyHistoryUpdated();
  logger.log('HISTORY', `session recorded: ${seconds}s (${config.sessionHistory.length} kept)`);
}

function historyPayload() {
  return {
    sessionHistory: config.sessionHistory || [],
    videoHistory: config.videoHistory || [],
    climaxHistory: config.climaxHistory || [],
    oCount: config.oCount || 0,
    videoOCounts: config.videoOCounts || {},
  };
}

function notifyHistoryUpdated() {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.webContents.send('history-updated', historyPayload());
  }
}

function scheduleHistorySave() {
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => {
    historySaveTimer = null;
    saveConfig(false);
  }, 1000);
}

function flushHistorySave() {
  if (!historySaveTimer) return;
  clearTimeout(historySaveTimer);
  historySaveTimer = null;
  saveConfig(false);
}

function recordVideoShown(item, state, instanceId) {
  if (!item || item.type !== 'video' || !item.path) return;
  const entry = {
    at: Date.now(),
    path: item.path,
    screen: state ? (state.index || 0) : 0,
    instanceId,
  };
  config.videoHistory = [...(config.videoHistory || []), entry].slice(-VIDEO_HISTORY_MAX);
  scheduleHistorySave();
  notifyHistoryUpdated();
}

function recordClimax() {
  const videos = [];
  for (const state of windowStates.values()) {
    for (const active of state.active || []) {
      if (active.item && active.item.type === 'video' && active.item.path) {
        videos.push(active.item.path);
      }
    }
  }
  if (!videos.length) {
    broadcastPlayers('climax-recorded', { added: 0, total: config.oCount || 0 });
    return;
  }

  const counts = { ...(config.videoOCounts || {}) };
  for (const file of videos) counts[file] = (counts[file] || 0) + 1;
  config.videoOCounts = counts;
  config.oCount = (config.oCount || 0) + videos.length;
  config.climaxHistory = [
    ...(config.climaxHistory || []),
    { at: Date.now(), videos },
  ].slice(-CLIMAX_HISTORY_MAX);
  clearTimeout(historySaveTimer);
  historySaveTimer = null;
  saveConfig(false);
  notifyHistoryUpdated();
  broadcastPlayers('climax-recorded', { added: videos.length, total: config.oCount });
  logger.log('HISTORY', `O logged for ${videos.length} visible video(s); O-count ${config.oCount}`);
}

// ── Session recording ─────────────────────────────────────────────────────────
//
// The capture itself lives in a player window (only a renderer can run a
// MediaRecorder). It streams chunks here every couple of seconds and main
// appends them straight to disk, so a long session never has to be held in
// memory and a hard crash still leaves a playable file behind.

function defaultRecordFolder() {
  let base;
  try { base = app.getPath('videos'); } catch (_) { base = app.getPath('userData'); }
  return path.join(base, 'GoonTiles');
}

function recordFolder() {
  return config.recordFolder || defaultRecordFolder();
}

function recordingWanted() {
  return !!(config.recordWebcam && config.webcamEnabled);
}

// Only the player window hosting the camera receives recording configuration.
function recordConfigFor(state) {
  if (!recordingWanted()) return null;
  const index = state.index || 0;
  const webcam = !!config.recordWebcam && !!config.webcamEnabled && index === (config.webcamScreen || 0);
  return webcam ? { webcam: true, bitrate: config.recordBitrate || 8 } : null;
}

function stampNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// Opens the file a renderer is about to record into, and hands back the id it
// tags its chunks with.
function openRecordingFile(kind, ext) {
  if (kind !== 'camera') throw new Error('Only camera recording is supported');
  const dir = recordFolder();
  fs.mkdirSync(dir, { recursive: true });
  const label = 'camera';
  // The renderer says which container its recorder settled on: MP4 normally,
  // WebM on a machine that cannot encode H.264.
  const suffix = ext === 'webm' ? 'webm' : 'mp4';
  let file = path.join(dir, `${recordingStamp || stampNow()} ${label}.${suffix}`);
  for (let n = 2; fs.existsSync(file); n++) {
    file = path.join(dir, `${recordingStamp || stampNow()} ${label} (${n}).${suffix}`);
  }
  const out = fs.createWriteStream(file);
  out.on('error', (e) => logger.log('ERROR', `recording write ${path.basename(file)}:`, String(e)));
  const id = `rec${++recordingSeq}`;
  openRecordings.set(id, { file, out, kind: label, bytes: 0 });
  logger.log('REC', `Recording ${label} to ${file}`);
  return { id, file };
}

function closeRecordingFile(id, note) {
  const rec = openRecordings.get(id);
  if (!rec) return;
  openRecordings.delete(id);
  try { rec.out.end(); } catch (_) {}
  const mb = (rec.bytes / (1024 * 1024)).toFixed(1);
  logger.log('REC', `Finished ${rec.kind}: ${path.basename(rec.file)} (${mb} MB)${note ? ` — ${note}` : ''}`);
  if (!openRecordings.size) {
    recordingWaiters.forEach((fn) => fn());
    recordingWaiters = [];
  }
}

// Asks every recording window to stop, then waits for the last chunk to land.
// Capped, because a renderer that has already gone away will never answer — the
// file is still valid, just short by up to one chunk.
function finishRecordings(reason) {
  if (!openRecordings.size) return Promise.resolve();
  if (finishingRecordings) return finishingRecordings;
  const live = windows.filter((w) => !w.isDestroyed());
  logger.log('REC', `Stopping recordings (${reason})`);
  for (const win of live) win.webContents.send('record-stop', { reason });
  finishingRecordings = new Promise((resolve) => {
    if (!live.length) { forceCloseRecordings('window already gone'); resolve(); return; }
    let timer = null;
    const done = () => { if (timer) clearTimeout(timer); resolve(); };
    recordingWaiters.push(done);
    timer = setTimeout(() => {
      recordingWaiters = recordingWaiters.filter((fn) => fn !== done);
      forceCloseRecordings('renderer did not finish in time');
      resolve();
    }, 8000);
  }).then(() => { finishingRecordings = null; });
  return finishingRecordings;
}

function forceCloseRecordings(note) {
  for (const id of [...openRecordings.keys()]) closeRecordingFile(id, note);
}

function itemWithDims(item) {
  const d = dimsCache.get(item.path);
  return d ? { ...item, width: d.width, height: d.height } : item;
}

// ── IPC ───────────────────────────────────────────────────────────────────────

function setupIPC() {
  // Control window
  ipcMain.on('controls-ready', (event) => {
    event.sender.send('init', {
      config,
      displayCount: screen.getAllDisplays().length,
      recordFolderDefault: defaultRecordFolder(),
      poppersOptions: poppersCatalog(),
    });
  });

  ipcMain.handle('choose-folders', async () => {
    const result = await dialog.showOpenDialog(controlWin, {
      title: 'Add media folder(s)',
      properties: ['openDirectory', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.on('update-config', (_e, partial) => {
    const layoutKeys = ['layoutMode', 'gridCols', 'gridRows', 'maxCols', 'maxRows', 'minCols', 'minRows',
      'orientation', 'heroCell', 'heroSpan', 'heroPosition', 'centerSize', 'surroundTiles',
      'qualityFilter', 'minHeight',
      'webcamEnabled', 'webcamScreen', 'webcamHero'];
    const layoutChanged = layoutKeys.some((k) => k in partial && partial[k] !== config[k]);
    const playerKeys = ['volume', 'normalizeAudio', 'normalizeTarget', 'limiter',
      'stereoPan', 'stereoPanAmount', 'kenBurns', 'kenBurnsAmount', 'kenBurnsSeconds',
      'kenBurnsCenter', 'kenBurnsScope', 'kenBurnsRotate', 'kenBurnsBeatSync',
      'kenBurnsBeats', 'edgeInserts', 'tileControls', 'imageSeconds'];
    const playerChanged = playerKeys.some((k) => k in partial && partial[k] !== config[k]);
    config = { ...config, ...partial };
    saveConfig();
    if ('poppersBrand' in partial && breathingNextAt && !breathingActive) {
      broadcastPlayers('breathing-schedule', {
        nextAt: breathingNextAt,
        intervalMs: breathingIntervalMs,
        ...countdownFields(),
      });
    }
    if (['narrationFile', 'narrationBeforeBreathing', 'goalCountdownSound'].some((k) => k in partial)) {
      loadCues();
      armNarrationLeadIn();
      armGoalSound();
    }
    // Zones live on the window state, so push any change through to them.
    if ('screenZones' in partial) {
      for (const win of windows) {
        const st = windowStates.get(win.id);
        if (st) st.zone = zoneFor(st.index || 0);
      }
    }
    // Re-tile live so grid / shape changes are visible without restarting.
    if (layoutChanged || 'screenZones' in partial) for (const win of windows) relayout(win);
    else if (playerChanged) broadcastPlayers('player-config', playerConfig());
    // Apply tweaks live if overlays are currently showing.
    if (hypnoShown) {
      broadcastPlayers('hypno', hypnoPayload(true));
      startHypnoCycle();
    }
    if (textShown) {
      broadcastPlayers('text-overlay', textPayload(true));
      startAffirmations(); // restart sequence (picks up affirmation-folder changes)
    }
  });

  ipcMain.on('start-playback', (_e, partial) => {
    config = { ...config, ...partial };
    saveConfig();
    startPlayback();
  });

  // Player windows
  ipcMain.on('renderer-ready', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const state = windowStates.get(win.id);
    if (state) state.ready = true;
    logger.log('IPC', `renderer-ready from window ${win.id}`);
    // Sent before the first layout so the camera tile's stream can be recorded
    // from its very first frame.
    const rec = state && recordConfigFor(state);
    if (rec) event.sender.send('record-config', rec);
    // Catch a late-loading window up to the breathing countdown.
    if (config.breathingEnabled && breathingNextAt && !breathingActive) {
      event.sender.send('breathing-schedule', { nextAt: breathingNextAt, intervalMs: breathingIntervalMs, ...countdownFields() });
    }
    if (narrationActive) event.sender.send('narration', narrationPayload());
    // Sync this window to the current tempo / rhythm state.
    event.sender.send('tempo', { bpm: tempoBpm, t0: tempoT0 });
    if (rhythmShown) event.sender.send('rhythm', { show: true });
    if (hypnoShown) event.sender.send('hypno', hypnoPayload(true));
    if (textShown) event.sender.send('text-overlay', textPayload(true));
    if (config.goalEnabled) event.sender.send('goal', goalPayload());
    relayout(win);
  });

  // ── Recording ──────────────────────────────────────────────────────────────

  ipcMain.handle('record-open', (_e, { kind, ext }) => {
    if (quitting) return null; // no starting a file the quit is not waiting for
    try {
      return openRecordingFile(kind, ext);
    } catch (err) {
      logger.log('ERROR', 'Could not open a recording file:', String(err));
      return null;
    }
  });

  ipcMain.on('record-chunk', (_e, { id, data }) => {
    const rec = openRecordings.get(id);
    if (!rec || !data) return;
    const buf = Buffer.from(data.buffer || data, data.byteOffset || 0, data.byteLength || data.length);
    rec.bytes += buf.length;
    rec.out.write(buf);
  });

  ipcMain.on('record-close', (_e, { id, note }) => closeRecordingFile(id, note));

  ipcMain.handle('choose-record-folder', async () => {
    const result = await dialog.showOpenDialog(controlWin, {
      title: 'Where should recordings be saved?',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? '' : result.filePaths[0];
  });

  ipcMain.on('breathing-skip', () => skipBreathingExercise());

  ipcMain.on('countdown-set', (_e, { x, y, height }) => {
    if (typeof x === 'number') config.countdownX = Math.round(x);
    if (typeof y === 'number') config.countdownY = Math.round(y);
    if (typeof height === 'number') config.countdownHeight = Math.round(height);
    saveConfig();
    broadcastPlayers('countdown-pos', { x: config.countdownX, y: config.countdownY, height: config.countdownHeight });
  });

  ipcMain.on('breathing-now', () => {
    if (breathingActive || !config.breathingEnabled) return;
    logger.log('BREATHE', 'manually triggered');
    clearTimeout(breathingTimer); breathingTimer = null;
    triggerBreathingExercise();
  });

  ipcMain.on('rhythm-toggle', () => {
    rhythmShown = !rhythmShown;
    logger.log('RHYTHM', rhythmShown ? 'on' : 'off');
    if (rhythmShown) broadcastTempo();
    broadcastPlayers('rhythm', { show: rhythmShown });
  });

  ipcMain.on('tap-tempo', () => handleTap());

  ipcMain.on('hypno-toggle', () => {
    hypnoShown = !hypnoShown;
    logger.log('HYPNO', hypnoShown ? 'on' : 'off');
    broadcastPlayers('hypno', hypnoPayload(hypnoShown));
    if (hypnoShown) startHypnoCycle(); else stopHypnoCycle();
  });

  ipcMain.on('hypno-cycle', () => advanceHypnoPattern());

  ipcMain.on('text-toggle', () => {
    textShown = !textShown;
    logger.log('TEXT', textShown ? `on (${config.textMode})` : 'off');
    if (textShown) broadcastTempo();
    broadcastPlayers('text-overlay', textPayload(textShown));
    if (textShown) {
      startAffirmations();
    } else {
      stopAffirmations();
      setDuck(false);
      broadcastPlayers('affirmation', { word: '' });
    }
  });

  ipcMain.on('affirmation-ended', () => onAffirmationEnded());

  ipcMain.handle('choose-affirmation-folder', async () => {
    const r = await dialog.showOpenDialog(controlWin, { title: 'Choose affirmation audio folder', properties: ['openDirectory'] });
    return r.canceled ? '' : r.filePaths[0];
  });

  ipcMain.handle('choose-image-folder', async () => {
    const r = await dialog.showOpenDialog(controlWin, { title: 'Choose an image folder', properties: ['openDirectory'] });
    return r.canceled ? '' : r.filePaths[0];
  });

  ipcMain.handle('choose-pattern-folder', async () => {
    const r = await dialog.showOpenDialog(controlWin, { title: 'Choose pattern-video folder', properties: ['openDirectory'] });
    return r.canceled ? '' : r.filePaths[0];
  });

  ipcMain.on('audio-ready', () => {
    audioReady = true;
    if (pendingMusic) { sendMusic(pendingMusic.channel, pendingMusic.data); pendingMusic = null; }
  });

  ipcMain.on('audio-error', (_e, msg) => logger.log('AUDIO', 'error:', msg));

  // The audio window reports where the track is every couple of seconds; it
  // goes to disk at most every few seconds and on the way out.
  ipcMain.on('music-position', (_e, { path: file, seconds }) => {
    if (typeof file !== 'string' || !Number.isFinite(seconds)) return;
    musicPosition = { file, seconds };
    if (Date.now() - musicPositionSavedAt > 5000) saveMusicPosition();
  });

  ipcMain.on('cue-loaded', (_e, { path: file, duration }) => {
    if (typeof file !== 'string' || !(duration > 0)) return;
    cueDurations.set(file, duration);
    armNarrationLeadIn();
    armGoalSound();
  });

  ipcMain.on('cue-ended', (_e, { id }) => onCueEnded(id));

  ipcMain.handle('choose-audio-file', async (_e, { title } = {}) => {
    const r = await dialog.showOpenDialog(controlWin, {
      title: title || 'Choose a sound file',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'opus', 'webm'] }],
    });
    return r.canceled ? '' : r.filePaths[0];
  });

  // What the settings window shows beside a chosen voice file.
  ipcMain.handle('narration-info', (_e, { file } = {}) => {
    if (!file) return { exists: false, lines: 0, duration: 0 };
    const lines = narrationLines(file);
    let duration = 0;
    try { duration = +JSON.parse(fs.readFileSync(narrationSidecarPath(file), 'utf8')).duration || 0; } catch (_) { /* no sidecar */ }
    return { exists: fs.existsSync(file), lines: lines.length, duration };
  });

  ipcMain.on('music-info', (_e, { bpm, t0 }) => {
    const b = Math.min(240, Math.max(20, Math.round(bpm)));
    logger.log('TEMPO', `music BPM detected: ${b}`);
    tempoBpm = tempoTargetBpm = b;
    tempoT0 = t0;
    if (tempoRamp) { clearInterval(tempoRamp); tempoRamp = null; }
    config.bpm = b; saveConfig();
    broadcastTempo();
  });

  ipcMain.handle('choose-text-file', async () => {
    const r = await dialog.showOpenDialog(controlWin, {
      title: 'Choose a text file (one phrase per line)',
      properties: ['openFile'],
      filters: [{ name: 'Text', extensions: ['txt', 'text', 'md'] }],
    });
    if (r.canceled || !r.filePaths[0]) return [];
    try {
      return fs.readFileSync(r.filePaths[0], 'utf8')
        .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    } catch (e) {
      logger.log('ERROR', 'read text file:', String(e));
      return [];
    }
  });

  ipcMain.handle('choose-music', async () => {
    const r = await dialog.showOpenDialog(controlWin, {
      title: 'Choose a music track',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'opus', 'webm'] }],
    });
    return r.canceled ? '' : r.filePaths[0];
  });

  ipcMain.on('video-ended', (event, { instanceId }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const state = windowStates.get(win.id);
    if (!state) return;
    if (state.active.some((a) => isWebcam(a) && a.instanceId === instanceId)) return;
    // A forced grid has nothing to re-optimize, and the centre ring should not
    // be shuffled by one clip ending, so a finished clip is always replaced in
    // place in those; in auto mode it's the user's choice.
    if (config.replaceInPlace || config.layoutMode !== 'auto') {
      swapTile(win, instanceId);
      return;
    }
    state.active = state.active.filter((a) => a.instanceId !== instanceId);
    relayout(win, { quantize: true });
  });

  // Skip always swaps in place — the tile stays put and just changes video.
  ipcMain.on('swap-tile', (event, { instanceId }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) swapTile(win, instanceId);
  });

  ipcMain.on('previous-tile', (event, { instanceId }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) previousTile(win, instanceId);
  });

  ipcMain.on('mark-climax', () => recordClimax());

  ipcMain.on('folder-pref', (event, { folder, want }) => {
    const level = setFolderPref(folder, want);
    const counts = applyPreferenceOrder();
    logger.log('PREF', `${folder} → ${level === 1 ? 'preferred' : level === -1 ? 'avoided' : 'normal'}`
      + ` (queue: ${counts.preferred} preferred, ${counts.avoided} at the back)`);
    broadcastPrefLevels();
    if (controlWin && !controlWin.isDestroyed()) {
      controlWin.webContents.send('prefs-updated', config.folderPrefs);
    }
    if (level < 0) evictAvoided();
    // Tell the tile that asked what actually happened.
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender && !sender.isDestroyed()) {
      sender.webContents.send('pref-result', { folder, level, ...counts });
    }
  });

  ipcMain.on('swap-tile-positions', (event, { aId, bId }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) swapTilePositions(win, aId, bId);
  });

  ipcMain.on('clear-history', () => {
    config.sessionHistory = [];
    config.videoHistory = [];
    config.climaxHistory = [];
    config.oCount = 0;
    config.videoOCounts = {};
    saveConfig();
    logger.log('HISTORY', 'cleared');
    notifyHistoryUpdated();
  });

  ipcMain.on('set-volume', (_e, { volume }) => {
    config.volume = Math.max(0, Math.min(100, Math.round(volume)));
    saveConfig();
    broadcastPlayers('volume', { volume: config.volume });
  });

  ipcMain.on('insert-video', async (event, { side, kind }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const state = windowStates.get(win.id);
    if (!state || mediaQueue.length === 0) return;
    if (state.active.length >= tileCap()) {
      logger.log('INSERT', `window ${win.id} already at max tiles`);
      return;
    }
    const item = kind === 'vertical'
      ? await pickNextInRange({ orientation: 'vertical' }, state)
      : await pickNextInRange({}, state);
    if (win.isDestroyed()) return;
    if (!item) {
      logger.log('INSERT', 'no matching video found in queue');
      return;
    }
    const instanceId = ++instanceSeq;
    state.active.push({ instanceId, item, history: [], pinSide: side === 'left' ? 'left' : 'right' });
    markPlayed(item.path);
    recordVideoShown(item, state, instanceId);
    logger.log('INSERT', `${side} ${kind}: ${path.basename(item.path)}`);
    relayout(win);
  });

  ipcMain.on('remove-tile', (event, { instanceId }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const state = windowStates.get(win.id);
    if (!state) return;
    state.active = state.active.filter((a) => a.instanceId !== instanceId);
    logger.log('TILE', `removed tile ${instanceId} from window ${win.id}`);
    relayout(win, { noFill: true });
  });

  ipcMain.on('force-next', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const state = windowStates.get(win.id);
    if (!state) return;
    logger.log('KEY', `force-next on window ${win.id}`);
    state.active = [];
    relayout(win);
  });

  ipcMain.on('reshuffle', () => {
    logger.log('APP', 'Reshuffle');
    shuffleArray(mediaQueue);
    globalQueueIndex = 0;
    for (const win of windows) {
      const state = windowStates.get(win.id);
      if (state) state.active = [];
      relayout(win);
    }
  });

  ipcMain.on('quit', () => {
    logger.log('APP', 'Quit requested');
    quitting = true;
    app.quit();
  });

  ipcMain.on('open-controls', () => createControlWindow());

  ipcMain.on('renderer-log', (_e, msg) => logger.log('CONSOLE', msg));

  ipcMain.on('probe-ready', () => {
    probeReady = true;
    logger.log('PROBE', 'Prober ready');
    probeReadyWaiters.forEach((fn) => fn());
    probeReadyWaiters = [];
  });

  ipcMain.on('probe-result', (_e, { requestId, results }) => {
    const resolve = pendingProbes.get(requestId);
    if (resolve) {
      pendingProbes.delete(requestId);
      resolve(results);
    }
  });
}

// ── Playback bootstrap ──────────────────────────────────────────────────────

async function startPlayback() {
  watchedFolders = [...config.folders];
  await rescanFolders();

  if (mediaQueue.length === 0) {
    if (controlWin && !controlWin.isDestroyed()) {
      controlWin.webContents.send('error', 'No supported videos found in the selected folder(s).');
    }
    logger.log('WARN', 'startPlayback aborted: empty queue');
    return;
  }

  if (controlWin && !controlWin.isDestroyed()) controlWin.close();

  // Close out any recording from a previous run while its window is still
  // around to flush it, then stamp the files this session is about to write.
  await finishRecordings('restart');
  recordingStamp = stampNow();

  // Always rebuild windows so window-count / span / blank changes apply on Start.
  // Flagged so tearing the old ones down doesn't read as "nothing left, quit".
  // A voice from the previous run must not carry into this one.
  stopNarration();
  clearNarrationTimers();
  if (goalSoundPlaying) { sendMusic('stop-cue', { id: 'goal' }); goalSoundPlaying = false; }

  restarting = true;
  try {
    closeAllPlayerWindows();
    resetTempo();
    textShown = !!config.textEnabled; // text overlay starts per its setting
    createWindows();
  } finally {
    restarting = false;
  }
  startBreathingScheduler();
  applyMusicState();
  startGoalTimer();
  startAffirmations();
  recentlyPlayed.clear();
  playbackStartedAt = Date.now();
  startProgressiveRamp();
  loadCues();
  if (config.narrationAtStart && config.narrationFile) {
    // A moment for the windows to come up, so the first words are not lost.
    narrationStartTimer = setTimeout(() => { narrationStartTimer = null; startNarration('session start'); }, 1500);
  }
}

// Image folders that aren't already being scanned for clips — the ones that are
// get their stills picked up by the same pass.
function imageOnlyFolders() {
  if (!config.imagesEnabled) return [];
  return (config.imageFolders || []).filter((f) => f && !watchedFolders.includes(f));
}

async function rescanFolders() {
  stopWatching();

  const t0 = Date.now();
  const allFiles = [];
  for (const folder of watchedFolders) {
    await collectFiles(folder, allFiles, { videos: true, images: wantsImages(folder) });
  }
  for (const folder of imageOnlyFolders()) {
    await collectFiles(folder, allFiles, { videos: false, images: true });
  }
  if (config.shuffle) shuffleArray(allFiles);
  mediaQueue = config.folderRoundRobin ? roundRobinByFolder(allFiles) : allFiles;
  globalQueueIndex = 0;
  applyPreferenceOrder();

  logger.log('FOLDER', `Loaded ${mediaQueue.length} video(s) from ${watchedFolders.length} folder(s) in ${Date.now() - t0}ms`);

  startWatching(watchedFolders);
}

// Async, non-blocking recursive scan so a large library doesn't freeze the main
// process while videos are starting up.
async function collectFiles(dir, out, want = { videos: true, images: false }) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    logger.log('ERROR', `readdir ${dir}:`, String(e));
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(full, out, want);
    else if (wanted(full, want)) out.push(makeMediaItem(full));
  }
}

// A folder says which kinds it contributes, so marking one "images" doesn't
// drag in its clips and a clip folder doesn't quietly start serving stills.
function wanted(filePath, want) {
  if (want.videos && isVideoFile(filePath)) return true;
  return !!(want.images && config.imagesEnabled && isImageFile(filePath));
}

function wantsImages(folder) {
  return !!config.imagesEnabled && (config.imageFolders || []).includes(folder);
}

// Lightweight native recursive watch (chokidar stat-walks the whole tree on
// startup, which is the main cost with 1000+ files). Debounced rescan on change.
function startWatching(folders) {
  stopWatching();
  for (const folder of folders) {
    try {
      watchers.push(fs.watch(folder, { recursive: true, persistent: true }, () => scheduleRescan()));
    } catch (e) {
      logger.log('WATCH', `watch failed for ${folder}:`, String(e));
    }
  }
}

function stopWatching() {
  for (const w of watchers) { try { w.close(); } catch (_) {} }
  watchers = [];
  clearTimeout(rescanTimer);
}

function scheduleRescan() {
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(refreshQueue, 1500);
}

// Merge filesystem changes into the queue without resetting playback position.
async function refreshQueue() {
  const found = [];
  for (const folder of watchedFolders) {
    await collectFiles(folder, found, { videos: true, images: wantsImages(folder) });
  }
  for (const folder of imageOnlyFolders()) {
    await collectFiles(folder, found, { videos: false, images: true });
  }
  const foundPaths = new Set(found.map((m) => m.path));
  const existing = new Set(mediaQueue.map((m) => m.path));

  let added = 0;
  for (const m of found) if (!existing.has(m.path)) { mediaQueue.push(m); added++; }
  const before = mediaQueue.length;
  mediaQueue = mediaQueue.filter((m) => foundPaths.has(m.path));
  const removed = before - mediaQueue.length;

  if (added || removed) {
    applyPreferenceOrder();
    logger.log('WATCH', `queue updated: +${added} -${removed} → ${mediaQueue.length}`);
  }
}

function isVideoFile(filePath) {
  return VIDEO_EXTS.has(path.extname(filePath).toLowerCase());
}

function isImageFile(filePath) {
  return IMAGE_EXTS.has(path.extname(filePath).toLowerCase());
}

function makeMediaItem(filePath) {
  const image = isImageFile(filePath);
  return { path: filePath, type: image ? 'image' : 'video', width: 16, height: 9 };
}

// ── Re-layout engine ──────────────────────────────────────────────────────────

// Serialize relayouts per window so overlapping video-ended events don't race.
function relayout(win, opts = {}) {
  const state = windowStates.get(win.id);
  if (!state) return Promise.resolve();
  state.relayoutChain = state.relayoutChain
    .then(async () => {
      // Quantize natural video changes to land on the next beat.
      if (opts.quantize && config.videoBeatSync) {
        const d = msToNextBeat();
        if (d > 0) await new Promise((r) => setTimeout(r, d));
      }
      await doRelayout(win, opts);
    })
    .catch((e) => logger.log('ERROR', 'relayout:', e && e.stack ? e.stack : String(e)));
  return state.relayoutChain;
}

async function doRelayout(win, opts = {}) {
  if (win.isDestroyed()) return;
  const state = windowStates.get(win.id);
  if (!state || !state.ready || mediaQueue.length === 0) return;

  // Removing the only tile clears the screen (renderer removes all tiles).
  if (opts.noFill && state.active.length === 0) {
    win.webContents.send('apply-layout', { cells: [], config: playerConfig() });
    return;
  }

  syncWebcamSlot(state);

  const { width, height } = state.display;
  const surviving = state.active.slice(); // already-playing instances

  // Ensure survivors are probed, and gather in-range candidates to fill with.
  await probeDims(surviving.filter((s) => !isWebcam(s)).map((s) => s.item.path));
  const gatherCount = opts.noFill ? 0 : Math.max(0, effectiveTileCap() - surviving.length);
  const gathered = await gatherInRange(gatherCount, {
    cursor: cursorFor(state),
    zone: state.zone,
  });
  if (win.isDestroyed()) return;

  if (surviving.length === 0 && gathered.length === 0) {
    logger.log('WARN', `Window ${win.id}: nothing to show`
      + (state.zone && state.zone.length ? ` — its zone (${state.zone.map((f) => path.basename(f)).join(', ')}) has no clips passing the filters` : ' within the configured filters'));
    win.webContents.send('apply-layout', { cells: [], config: playerConfig() });
    return;
  }

  const candidates = [...surviving.map((s) => itemWithDims(s.item)), ...gathered.map((g) => g.item)];
  const layoutOpts = {
    minTiles: surviving.length,
    maxCols: config.maxCols,
    maxRows: config.maxRows,
    minCols: config.minCols,
    minRows: config.minRows,
  };
  if (config.layoutMode === 'grid') {
    layoutOpts.forceGrid = {
      cols: config.gridCols,
      rows: config.gridRows,
      hero: config.heroCell,
      heroSpan: config.heroSpan,
      heroPosition: config.heroPosition,
    };
  }
  if (config.layoutMode === 'center') {
    layoutOpts.center = { size: (+config.centerSize || 50) / 100, tiles: surroundCount() };
  }
  // Survivors are never trimmed by the ramp — a manual insert during the ramp
  // stays put rather than being removed on the next re-layout.
  layoutOpts.maxTiles = Math.max(effectiveTileCap(), surviving.length);
  // On removal, don't backfill the freed slot — just reflow the survivors.
  if (opts.noFill) layoutOpts.maxTiles = surviving.length;
  const choice = chooseLayout(candidates, width, height, layoutOpts);

  // Commit new items to fill up to choice.count, then advance the queue cursor
  // past the last one consumed.
  const newCount = Math.max(0, choice.count - surviving.length);
  for (let i = 0; i < newCount && i < gathered.length; i++) {
    const instanceId = ++instanceSeq;
    state.active.push({ instanceId, item: gathered[i].item, history: [] });
    markPlayed(gathered[i].item.path);
    recordVideoShown(gathered[i].item, state, instanceId);
  }
  if (newCount > 0 && gathered.length > 0) {
    advanceQueue(gathered[Math.min(newCount, gathered.length) - 1].offset, state);
  }
  // Trim if optimizer chose fewer than surviving (shouldn't happen given minTiles).
  state.active = state.active.slice(0, choice.count);

  applyPins(state.active, choice);

  // active[i] corresponds to candidate/subset index i; assignment maps each
  // region to one of those indices.
  const cells = choice.rects.map((rect, regionIdx) => {
    const a = state.active[choice.assignment[regionIdx]];
    if (isWebcam(a)) {
      return {
        instanceId: a.instanceId, path: '', kind: 'webcam',
        folder: '', folderLabel: 'Camera', prefLevel: 0,
        x: rect[0], y: rect[1], w: rect[2], h: rect[3],
      };
    }
    return {
      instanceId: a.instanceId,
      path: a.item.path,
      kind: a.item.type === 'image' ? 'image' : a.item.type === 'webcam' ? 'webcam' : 'video',
      ...folderInfoFor(a.item.path),
      x: rect[0], y: rect[1], w: rect[2], h: rect[3],
    };
  });

  logger.log('LAYOUT', `Window ${win.id}: ${choice.count} tiles, +${newCount} new`);

  state.lastCells = cells;
  win.webContents.send('apply-layout', { cells, config: playerConfig() });
}

// Drag-and-drop swap of two tiles' positions. Their rectangles trade places and
// both instances get pinned there, so the next re-layout keeps the arrangement.
function swapTilePositions(win, aId, bId) {
  const state = windowStates.get(win.id);
  if (!state || !state.lastCells) return;
  const cells = state.lastCells;
  const ai = cells.findIndex((c) => c.instanceId === aId);
  const bi = cells.findIndex((c) => c.instanceId === bId);
  if (ai < 0 || bi < 0 || ai === bi) return;

  // Cell order is region order, so trade the occupants and leave the rectangles
  // where they are — that keeps cell index == region index for the pins below
  // (and for any further swap before the next re-layout).
  const occupant = (c) => ({
    instanceId: c.instanceId, path: c.path,
    folder: c.folder, folderLabel: c.folderLabel, prefLevel: c.prefLevel,
  });
  const a = occupant(cells[ai]);
  const b = occupant(cells[bi]);
  Object.assign(cells[ai], b);
  Object.assign(cells[bi], a);

  for (const [id, region] of [[aId, bi], [bId, ai]]) {
    const inst = state.active.find((x) => x.instanceId === id);
    if (inst) { inst.pinRegion = region; delete inst.pinSide; }
  }
  logger.log('TILE', `swapped positions of ${aId} and ${bId} in window ${win.id}`);
  win.webContents.send('apply-layout', { cells, config: playerConfig() });
}

function isWebcam(active) {
  return !!active && active.item && active.item.type === 'webcam';
}

// Add or drop this window's camera tile so it matches the current settings. The
// camera is pinned to region 0 — the hero cell in a hero grid, the first cell
// otherwise — when it is set to lead.
function syncWebcamSlot(state) {
  const wanted = config.webcamEnabled && (state.index || 0) === (config.webcamScreen || 0);
  const existing = state.active.find(isWebcam);
  if (!wanted) {
    if (existing) state.active = state.active.filter((a) => !isWebcam(a));
    return;
  }
  if (existing) {
    existing.pinRegion = config.webcamHero ? 0 : existing.pinRegion;
    return;
  }
  const entry = {
    instanceId: ++instanceSeq,
    item: { path: WEBCAM_PATH, type: 'webcam', width: 16, height: 9 },
  };
  if (config.webcamHero) entry.pinRegion = 0;
  state.active.unshift(entry);
  logger.log('WEBCAM', `camera tile added to window ${state.index || 0}`);
}

// Player-side settings that ride along with every layout push.
function playerConfig() {
  return {
    skipSeconds: config.skipSeconds,
    muted: startMuted,
    edgeInserts: config.edgeInserts,
    tileControls: config.tileControls,
    imageSeconds: config.imageSeconds,
    volume: config.volume,
    normalizeAudio: config.normalizeAudio,
    normalizeTarget: config.normalizeTarget,
    limiter: config.limiter,
    stereoPan: config.stereoPan,
    stereoPanAmount: config.stereoPanAmount,
    kenBurns: config.kenBurns,
    kenBurnsAmount: config.kenBurnsAmount,
    kenBurnsSeconds: config.kenBurnsSeconds,
    kenBurnsRotate: config.kenBurnsRotate,
    kenBurnsBeatSync: config.kenBurnsBeatSync,
    kenBurnsBeats: config.kenBurnsBeats,
    kenBurnsCenter: config.kenBurnsCenter,
    kenBurnsScope: config.kenBurnsScope,
  };
}

// Replace the clip inside one tile without disturbing the layout — the tile
// keeps its rectangle and just cross-fades to the next video.
function swapTile(win, instanceId) {
  const state = windowStates.get(win.id);
  if (!state) return Promise.resolve();
  state.relayoutChain = state.relayoutChain
    .then(async () => {
      if (win.isDestroyed()) return;
      const idx = state.active.findIndex((a) => a.instanceId === instanceId);
      if (idx < 0 || isWebcam(state.active[idx])) return;
      const item = await pickNextInRange({}, state);
      if (win.isDestroyed()) return;
      if (!item) {
        // Nothing left to swap in — drop the tile and let the others reflow.
        state.active.splice(idx, 1);
        await doRelayout(win, { noFill: true });
        return;
      }
      const active = state.active[idx];
      active.history = Array.isArray(active.history) ? active.history : [];
      active.history.push(active.item);
      active.history = active.history.slice(-TILE_HISTORY_MAX);
      active.item = item;
      markPlayed(item.path);
      recordVideoShown(item, state, instanceId);
      logger.log('TILE', `window ${win.id} tile ${instanceId} → ${path.basename(item.path)}`);
      win.webContents.send('swap-tile', {
        instanceId,
        path: item.path,
        kind: item.type === 'image' ? 'image' : 'video',
        ...folderInfoFor(item.path),
      });
    })
    .catch((e) => logger.log('ERROR', 'swapTile:', e && e.stack ? e.stack : String(e)));
  return state.relayoutChain;
}

function previousTile(win, instanceId) {
  const state = windowStates.get(win.id);
  if (!state) return Promise.resolve();
  state.relayoutChain = state.relayoutChain
    .then(() => {
      if (win.isDestroyed()) return;
      const active = state.active.find((a) => a.instanceId === instanceId);
      if (!active || isWebcam(active)) {
        win.webContents.send('previous-result', { instanceId, found: false });
        return;
      }
      const previous = Array.isArray(active.history) ? active.history.pop() : null;
      if (!previous) {
        win.webContents.send('previous-result', { instanceId, found: false });
        return;
      }
      active.item = previous;
      markPlayed(previous.path);
      recordVideoShown(previous, state, instanceId);
      logger.log('TILE', `window ${win.id} tile ${instanceId} back → ${path.basename(previous.path)}`);
      win.webContents.send('swap-tile', {
        instanceId,
        path: previous.path,
        kind: previous.type === 'image' ? 'image' : 'video',
        ...folderInfoFor(previous.path),
      });
      win.webContents.send('previous-result', { instanceId, found: true });
    })
    .catch((e) => logger.log('ERROR', 'previousTile:', e && e.stack ? e.stack : String(e)));
  return state.relayoutChain;
}

// Push refreshed folder-preference badges to every tile currently on screen.
function broadcastPrefLevels() {
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    const state = windowStates.get(win.id);
    if (!state) continue;
    win.webContents.send('pref-levels', state.active.map((a) => ({
      instanceId: a.instanceId,
      prefLevel: prefLevelFor(a.item.path),
    })));
  }
}

// Swap out anything currently playing from a folder the user just avoided.
function evictAvoided() {
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    const state = windowStates.get(win.id);
    if (!state) continue;
    for (const a of state.active.slice()) {
      if (prefLevelFor(a.item.path) < 0) swapTile(win, a.instanceId);
    }
  }
}

// Honour user-placed tiles before falling back to the aspect-ratio assignment:
// first the explicit region pins from a drag-swap, then the left/right pins from
// a manual insert. A pin for a region this layout no longer has is dropped.
function applyPins(active, choice) {
  const regionCount = choice.rects.length;
  const regionOf = [];
  choice.assignment.forEach((ai, ri) => { regionOf[ai] = ri; });

  const claimed = new Set();
  for (let i = 0; i < active.length; i++) {
    const target = active[i].pinRegion;
    if (target == null) continue;
    if (target >= regionCount) { delete active[i].pinRegion; continue; }
    if (claimed.has(target)) continue;
    claimed.add(target);
    const from = regionOf[i];
    if (from === target) continue;
    // Swap this instance into its pinned region, displacing whoever held it.
    const displaced = choice.assignment[target];
    choice.assignment[target] = i;
    choice.assignment[from] = displaced;
    regionOf[i] = target;
    regionOf[displaced] = from;
  }

  applySidePins(active, choice, claimed);
}

// Move side-pinned instances (manual inserts) to the left-/right-most regions.
function applySidePins(active, choice, claimed) {
  const pins = active.map((a, i) => ({ i, side: a.pinSide }))
    .filter((p) => p.side && active[p.i].pinRegion == null);
  if (pins.length === 0) return;

  const byX = choice.rects
    .map((r, ri) => ({ ri, cx: r[0] + r[2] / 2 }))
    .sort((a, b) => a.cx - b.cx)
    .map((o) => o.ri);

  const regionOf = [];
  choice.assignment.forEach((ai, ri) => { regionOf[ai] = ri; });

  const used = new Set(claimed || []);
  const nextRegion = (side) => {
    const list = side === 'left' ? byX : [...byX].reverse();
    for (const ri of list) if (!used.has(ri)) return ri;
    return -1;
  };

  for (const pin of pins) {
    const target = nextRegion(pin.side);
    if (target < 0) continue;
    used.add(target);
    const occupant = choice.assignment[target];
    const oldRegion = regionOf[pin.i];
    if (oldRegion === target) continue;
    choice.assignment[target] = pin.i;
    choice.assignment[oldRegion] = occupant;
    regionOf[pin.i] = target;
    regionOf[occupant] = oldRegion;
  }
}

// Deal the queue one clip per folder in turn, so consecutive picks come from
// different folders instead of whatever a plain shuffle happened to clump
// together. Folders that run out drop out of the rotation; every clip still
// appears exactly once per pass.
function roundRobinByFolder(items) {
  const buckets = new Map();
  for (const item of items) {
    const dir = path.dirname(item.path);
    if (!buckets.has(dir)) buckets.set(dir, []);
    buckets.get(dir).push(item);
  }
  if (buckets.size < 2) return items;

  const lists = [...buckets.values()];
  shuffleArray(lists); // don't always lead with the same folder
  const out = [];
  let dealt = true;
  for (let round = 0; dealt; round++) {
    dealt = false;
    for (const list of lists) {
      if (round < list.length) { out.push(list[round]); dealt = true; }
    }
  }
  return out;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
