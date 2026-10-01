'use strict';

const folderListEl = document.getElementById('folderList');
const addFolderBtn = document.getElementById('addFolder');
const clearFoldersBtn = document.getElementById('clearFolders');
const clearFoldersLabelEl = document.getElementById('clearFoldersLabel');
const skipEl = document.getElementById('skipSeconds');
const minLengthEl = document.getElementById('minLength');
const maxLengthEl = document.getElementById('maxLength');
const minLengthValEl = document.getElementById('minLengthVal');
const maxLengthValEl = document.getElementById('maxLengthVal');
const windowCountEl = document.getElementById('windowCount');
const LENGTH_MAX = 3600; // 1 hour; the top stop means "no limit"
// Slider stops in seconds — fine near the bottom, coarse at the top.
const STOPS = [0, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600];

function idxForSeconds(sec) {
  let best = 0, bd = Infinity;
  STOPS.forEach((s, i) => { const d = Math.abs(s - sec); if (d < bd) { bd = d; best = i; } });
  return best;
}
const layoutModeEl = document.getElementById('layoutMode');
const gridColsEl = document.getElementById('gridCols');
const gridRowsEl = document.getElementById('gridRows');
const maxColsEl = document.getElementById('maxCols');
const maxRowsEl = document.getElementById('maxRows');
const minColsEl = document.getElementById('minCols');
const minRowsEl = document.getElementById('minRows');
const heroCellEl = document.getElementById('heroCell');
const heroSpanEl = document.getElementById('heroSpan');
const heroPositionEl = document.getElementById('heroPosition');
const centerSizeEl = document.getElementById('centerSize');
const centerSizeValEl = document.getElementById('centerSizeVal');
const surroundTilesEl = document.getElementById('surroundTiles');
const roundRobinEl = document.getElementById('folderRoundRobin');
const cooldownEl = document.getElementById('cooldownMinutes');
const kenBurnsEl = document.getElementById('kenBurns');
const kenBurnsAmountEl = document.getElementById('kenBurnsAmount');
const kenBurnsAmountValEl = document.getElementById('kenBurnsAmountVal');
const kenBurnsSecondsEl = document.getElementById('kenBurnsSeconds');
const kenBurnsRotateEl = document.getElementById('kenBurnsRotate');
const kenBurnsRotateValEl = document.getElementById('kenBurnsRotateVal');
const kenBurnsBeatSyncEl = document.getElementById('kenBurnsBeatSync');
const kenBurnsBeatsEl = document.getElementById('kenBurnsBeats');
const kenBurnsCenterEl = document.getElementById('kenBurnsCenter');
const kenBurnsScopeEl = document.getElementById('kenBurnsScope');
const normalizeTargetEl = document.getElementById('normalizeTarget');
const normalizeTargetValEl = document.getElementById('normalizeTargetVal');
const stereoPanEl = document.getElementById('stereoPan');
const stereoPanAmountEl = document.getElementById('stereoPanAmount');
const stereoPanAmountValEl = document.getElementById('stereoPanAmountVal');
const progressiveEnabledEl = document.getElementById('progressiveEnabled');
const progressiveMinutesEl = document.getElementById('progressiveMinutes');
const progressiveStartTilesEl = document.getElementById('progressiveStartTiles');
const historyStatsEl = document.getElementById('historyStats');
const historyGraphEl = document.getElementById('historyGraph');
const oVideoListEl = document.getElementById('oVideoList');
const climaxHistoryListEl = document.getElementById('climaxHistoryList');
const videoHistoryListEl = document.getElementById('videoHistoryList');
const clearHistoryBtn = document.getElementById('clearHistory');
const presetSelectEl = document.getElementById('presetSelect');
const savePresetBtn = document.getElementById('savePreset');
const savePresetAsBtn = document.getElementById('savePresetAs');
const deletePresetBtn = document.getElementById('deletePreset');
const presetInfoEl = document.getElementById('presetInfo');
const folderSetSelectEl = document.getElementById('folderSetSelect');
const saveFolderSetBtn = document.getElementById('saveFolderSet');
const saveFolderSetAsBtn = document.getElementById('saveFolderSetAs');
const deleteFolderSetBtn = document.getElementById('deleteFolderSet');
const folderSetInfoEl = document.getElementById('folderSetInfo');
const orientationEl = document.getElementById('orientation');
const replaceInPlaceEl = document.getElementById('replaceInPlace');
const volumeEl = document.getElementById('volume');
const volumeValEl = document.getElementById('volumeVal');
const normalizeAudioEl = document.getElementById('normalizeAudio');
const limiterEl = document.getElementById('limiter');
const qualityFilterEl = document.getElementById('qualityFilter');
const minHeightEl = document.getElementById('minHeight');
const imagesEnabledEl = document.getElementById('imagesEnabled');
const imageSecondsEl = document.getElementById('imageSeconds');
const webcamEnabledEl = document.getElementById('webcamEnabled');
const webcamScreenEl = document.getElementById('webcamScreen');
const webcamHeroEl = document.getElementById('webcamHero');
const recordWebcamEl = document.getElementById('recordWebcam');
const recordBitrateEl = document.getElementById('recordBitrate');
const chooseRecordFolderBtn = document.getElementById('chooseRecordFolder');
const clearRecordFolderBtn = document.getElementById('clearRecordFolder');
const recordFolderInfoEl = document.getElementById('recordFolderInfo');
const viewDetailedEl = document.getElementById('viewDetailed');
const viewCondensedEl = document.getElementById('viewCondensed');
const tocHereEl = document.getElementById('tocHere');
const shuffleEl = document.getElementById('shuffle');
const edgeInsertsEl = document.getElementById('edgeInserts');
const tileControlsEl = document.getElementById('tileControls');
const blankUnusedEl = document.getElementById('blankUnused');
const spanAllEl = document.getElementById('spanAll');
const musicEnabledEl = document.getElementById('musicEnabled');
const chooseMusicBtn = document.getElementById('chooseMusic');
const musicListEl = document.getElementById('musicList');
const choosePatternFolderBtn = document.getElementById('choosePatternFolder');
const clearPatternFolderBtn = document.getElementById('clearPatternFolder');
const patternFolderInfoEl = document.getElementById('patternFolderInfo');
const textEnabledEl = document.getElementById('textEnabled');
const textModeEl = document.getElementById('textMode');
const chooseAffirmFolderBtn = document.getElementById('chooseAffirmFolder');
const clearAffirmFolderBtn = document.getElementById('clearAffirmFolder');
const affirmInfoEl = document.getElementById('affirmInfo');
const hypnoTextEl = document.getElementById('hypnoText');
const hypnoOpacityEl = document.getElementById('hypnoOpacity');
const hypnoOpacityValEl = document.getElementById('hypnoOpacityVal');
const breathingBeatSyncEl = document.getElementById('breathingBeatSync');
const videoBeatSyncEl = document.getElementById('videoBeatSync');
const goalEnabledEl = document.getElementById('goalEnabled');
const goalCountdownEl = document.getElementById('goalCountdown');
const goalMinutesEl = document.getElementById('goalMinutes');
const poppersBrandEl = document.getElementById('poppersBrand');
const poppersBrandInfoEl = document.getElementById('poppersBrandInfo');
const chooseNarrationBtn = document.getElementById('chooseNarration');
const clearNarrationBtn = document.getElementById('clearNarration');
const narrationInfoEl = document.getElementById('narrationInfo');
const narrationTextEl = document.getElementById('narrationText');
const narrationAtStartEl = document.getElementById('narrationAtStart');
const narrationBeforeBreathingEl = document.getElementById('narrationBeforeBreathing');
const chooseGoalSoundBtn = document.getElementById('chooseGoalSound');
const clearGoalSoundBtn = document.getElementById('clearGoalSound');
const goalSoundInfoEl = document.getElementById('goalSoundInfo');
const bestInfoEl = document.getElementById('bestInfo');
const resetBestBtn = document.getElementById('resetBest');
const hypnoCycleEl = document.getElementById('hypnoCycle');
const hypnoCycleSecondsEl = document.getElementById('hypnoCycleSeconds');
const chooseTextFileBtn = document.getElementById('chooseTextFile');
const clearTextFileBtn = document.getElementById('clearTextFile');
const hypnoLinesInfoEl = document.getElementById('hypnoLinesInfo');

// Breathing exercise controls
const breathingFields = {
  breathingEnabled: document.getElementById('breathingEnabled'),
  breathingIntervalMin: document.getElementById('breathingIntervalMin'),
  breathsPerExercise: document.getElementById('breathsPerExercise'),
  inhaleSeconds: document.getElementById('inhaleSeconds'),
  holdSeconds: document.getElementById('holdSeconds'),
  exhaleSeconds: document.getElementById('exhaleSeconds'),
  holdAfterSeconds: document.getElementById('holdAfterSeconds'),
  breathingSound: document.getElementById('breathingSound'),
};
const startBtn = document.getElementById('start');
const errorEl = document.getElementById('error');
const nameDialogEl = document.getElementById('nameDialog');
const nameFormEl = document.getElementById('nameForm');
const nameLabelEl = document.getElementById('nameLabel');
const nameInputEl = document.getElementById('nameInput');
const nameCancelBtn = document.getElementById('nameCancel');

// Electron has no window.prompt() (it throws), so "Save as…" asks for its
// name with a small modal of our own. Resolves to '' when dismissed. The
// answer comes straight from the Save / Cancel handlers: the dialog's own
// `close` event does not fire reliably here, so nothing waits on it.
let nameResolve = null;

function finishName(value) {
  const resolve = nameResolve;
  nameResolve = null;
  if (nameDialogEl.open) nameDialogEl.close();
  if (resolve) resolve((value || '').trim());
}

function askName(label, suggestion) {
  finishName(''); // a box left open by an earlier ask is a cancel
  return new Promise((resolve) => {
    nameResolve = resolve;
    nameLabelEl.textContent = label;
    nameInputEl.value = suggestion || '';
    nameDialogEl.showModal();
    nameInputEl.focus();
    nameInputEl.select();
  });
}
nameFormEl.addEventListener('submit', (e) => { e.preventDefault(); finishName(nameInputEl.value); });
nameCancelBtn.addEventListener('click', () => finishName(''));
nameDialogEl.addEventListener('cancel', (e) => { e.preventDefault(); finishName(''); }); // Esc
nameDialogEl.addEventListener('close', () => finishName('')); // closed some other way
const displaysEl = document.getElementById('displays');

let recordFolderDefault = ''; // where recordings go when no folder is chosen
let poppersOptions = [];

// Nothing is saved until the real config has arrived. Until then `state` is
// only the defaults below, and saving it would wipe the folder list and every
// other setting on disk — anything that fires a change event early (Chromium
// restoring form values, an errant listener) must not be able to do that.
let initialized = false;

let state = {
  folders: [], skipSeconds: 5, shuffle: true, maxCols: 3, maxRows: 1, windowCount: 0,
  layoutMode: 'auto', gridCols: 3, gridRows: 1, minCols: 1, minRows: 1,
  heroCell: false, heroSpan: 2, heroPosition: 'top-left',
  centerSize: 50, surroundTiles: 8,
  folderRoundRobin: true, cooldownMinutes: 20,
  orientation: 'any', replaceInPlace: false, edgeInserts: true, tileControls: 'auto',
  qualityFilter: false, minHeight: 720,
  imagesEnabled: false, imageFolders: [], imageSeconds: 12, condensed: false,
  screenZones: [], webcamEnabled: false, webcamScreen: 0, webcamHero: true,
  recordWebcam: false, recordBitrate: 8, recordFolder: '',
  folderPrefs: {}, volume: 100, normalizeAudio: true, limiter: true,
  stereoPan: false, stereoPanAmount: 60,
  kenBurns: false, kenBurnsAmount: 6, kenBurnsSeconds: 30,
  kenBurnsRotate: 0, kenBurnsBeatSync: false, kenBurnsBeats: 16,
  kenBurnsCenter: 'random', kenBurnsScope: 'tile', normalizeTarget: 40,
  progressiveEnabled: false, progressiveMinutes: 20, progressiveStartTiles: 1,
  sessionHistory: [], videoHistory: [], climaxHistory: [], oCount: 0, videoOCounts: {},
  presets: {}, activePreset: '',
  folderSets: {}, activeFolderSet: '',
  blankUnusedScreens: true, spanAllScreens: false, minLength: 0, maxLength: LENGTH_MAX,
  breathingEnabled: false, breathingIntervalMin: 10, breathsPerExercise: 5,
  inhaleSeconds: 4, holdSeconds: 4, exhaleSeconds: 6, holdAfterSeconds: 0, breathingSound: true,
  poppersBrand: 'rush',
  musicEnabled: false, musicFile: '',
  patternFolder: '', hypnoOpacity: 25, hypnoCycle: false, hypnoCycleSeconds: 20,
  textEnabled: false, textMode: 'beat-flash', hypnoText: 'Relax', hypnoLines: [], affirmationFolder: '',
  breathingBeatSync: false, videoBeatSync: false,
  goalEnabled: false, goalCountdown: true, goalMinutes: 0, personalBest: 0,
  narrationFile: '', narrationText: true, narrationAtStart: true, narrationBeforeBreathing: false,
  goalCountdownSound: '',
};

function fmtBest(s) {
  s = Math.max(0, Math.floor(s || 0));
  return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'none yet';
}

function renderTextLines() {
  const n = (state.hypnoLines || []).length;
  hypnoLinesInfoEl.textContent = n ? `${n} line${n === 1 ? '' : 's'} loaded` : 'Optional — random lines shown in sequence';
}

function renderPatternFolder() {
  patternFolderInfoEl.textContent = state.patternFolder
    ? state.patternFolder.replace(/\\/g, '/').split('/').pop()
    : 'Grayscale clips — toggle with H, cycle with P';
}

function renderAffirmFolder() {
  affirmInfoEl.textContent = state.affirmationFolder
    ? state.affirmationFolder.replace(/\\/g, '/').split('/').pop()
    : 'Clips whose filename is the spoken line; ducks other audio';
}

function renderPoppersBrand() {
  const availability = new Map(poppersOptions.map((option) => [option.id, option]));
  for (const option of poppersBrandEl.options) {
    const info = availability.get(option.value);
    option.disabled = !!info && !info.available;
    if (info) option.textContent = info.available ? info.label : `${info.label} — add ${info.file}`;
  }
  const selected = availability.get(state.poppersBrand);
  if (!selected || !selected.available) {
    const fallback = poppersOptions.find((option) => option.available);
    if (fallback) state.poppersBrand = fallback.id;
  }
  poppersBrandEl.value = state.poppersBrand;
  const current = availability.get(state.poppersBrand);
  poppersBrandInfoEl.textContent = current && current.available
    ? `${current.label} fills as the next round approaches`
    : 'No bundled bottle image is available';
}

function baseName(p) {
  return (p || '').replace(/\\/g, '/').split('/').pop();
}

// The voice file's name, plus what the timing file beside it holds.
async function renderNarration() {
  const file = state.narrationFile;
  if (!file) {
    narrationInfoEl.textContent = 'A WAV from the hypnosis studio, with its .json beside it';
    return;
  }
  narrationInfoEl.textContent = baseName(file);
  try {
    const info = await window.controls.narrationInfo(file);
    if (state.narrationFile !== file) return; // changed while we looked
    const secs = info.duration ? ` · ${Math.round(info.duration)}s` : '';
    if (!info.exists) narrationInfoEl.textContent = `${baseName(file)} — file not found`;
    else if (info.lines) narrationInfoEl.textContent = `${baseName(file)}${secs} · ${info.lines} timed line${info.lines === 1 ? '' : 's'}`;
    else narrationInfoEl.textContent = `${baseName(file)} — no timing .json beside it, so the words will not flash`;
  } catch (_) { /* the name alone will do */ }
}

function renderGoalSound() {
  goalSoundInfoEl.textContent = state.goalCountdownSound
    ? baseName(state.goalCountdownSound)
    : 'Plays so it ends exactly as the target is reached';
}

function renderMusic() {
  musicListEl.innerHTML = '';
  if (!state.musicFile) return;
  const li = document.createElement('li');
  li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--panel-2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:13px;';
  const span = document.createElement('span');
  span.textContent = state.musicFile.replace(/\\/g, '/').split('/').pop();
  span.title = state.musicFile;
  span.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:10px;';
  const rm = document.createElement('span');
  rm.textContent = '✕'; rm.style.cssText = 'color:var(--danger);cursor:pointer;font-weight:700;';
  rm.addEventListener('click', () => { state.musicFile = ''; persist(); renderMusic(); });
  li.appendChild(span); li.appendChild(rm);
  musicListEl.appendChild(li);
}

const BREATHING_BOUNDS = {
  breathingIntervalMin: [1, 240], breathsPerExercise: [1, 30],
  inhaleSeconds: [0, 30], holdSeconds: [0, 30], exhaleSeconds: [0, 30], holdAfterSeconds: [0, 30],
};

function fmtLen(v, isMax) {
  if (isMax && v >= LENGTH_MAX) return '∞';
  if (!isMax && v <= 0) return 'any';
  if (v < 60) return v + 's';
  const m = Math.floor(v / 60); const s = v % 60;
  return s ? `${m}m ${s}s` : `${m} min`;
}

function refreshLengthLabels() {
  minLengthValEl.textContent = fmtLen(state.minLength, false);
  maxLengthValEl.textContent = fmtLen(state.maxLength, true);
}

window.controls.onInit(({ config, displayCount, recordFolderDefault: recDefault, poppersOptions: options }) => {
  state = { ...state, ...config };
  recordFolderDefault = recDefault || '';
  poppersOptions = Array.isArray(options) ? options : [];
  // windowCount 0 = auto; resolve to the actual screen count for display.
  if (!state.windowCount || state.windowCount < 1) state.windowCount = displayCount;
  for (const el of [minLengthEl, maxLengthEl]) {
    el.min = 0; el.max = STOPS.length - 1; el.step = 1;
  }
  windowCountEl.max = Math.max(8, displayCount);
  displaysEl.textContent = `${displayCount} display${displayCount === 1 ? '' : 's'}`;
  applyStateToUI();
  initialized = true;
});

// Paint every control from `state`. Split out of onInit so loading a preset can
// refresh the whole window in one call.
function applyStateToUI() {
  skipEl.value = state.skipSeconds;
  minLengthEl.value = idxForSeconds(state.minLength);
  maxLengthEl.value = idxForSeconds(state.maxLength);
  refreshLengthLabels();
  windowCountEl.value = state.windowCount;
  layoutModeEl.value = state.layoutMode;
  gridColsEl.value = state.gridCols;
  gridRowsEl.value = state.gridRows;
  maxColsEl.value = state.maxCols;
  maxRowsEl.value = state.maxRows;
  minColsEl.value = state.minCols;
  minRowsEl.value = state.minRows;
  orientationEl.value = state.orientation;
  replaceInPlaceEl.checked = !!state.replaceInPlace;
  syncLayoutMode();
  heroCellEl.checked = !!state.heroCell;
  heroSpanEl.value = state.heroSpan;
  heroPositionEl.value = state.heroPosition;
  centerSizeEl.value = state.centerSize;
  centerSizeValEl.textContent = `${state.centerSize}%`;
  surroundTilesEl.value = state.surroundTiles;
  roundRobinEl.checked = !!state.folderRoundRobin;
  cooldownEl.value = state.cooldownMinutes;
  kenBurnsEl.checked = !!state.kenBurns;
  kenBurnsAmountEl.value = state.kenBurnsAmount;
  kenBurnsAmountValEl.textContent = `${state.kenBurnsAmount}%`;
  kenBurnsSecondsEl.value = state.kenBurnsSeconds;
  kenBurnsRotateEl.value = state.kenBurnsRotate;
  kenBurnsRotateValEl.textContent = `${state.kenBurnsRotate}°`;
  kenBurnsBeatSyncEl.checked = !!state.kenBurnsBeatSync;
  kenBurnsBeatsEl.value = state.kenBurnsBeats;
  syncDriftTiming();
  kenBurnsCenterEl.value = state.kenBurnsCenter;
  kenBurnsScopeEl.value = state.kenBurnsScope;
  normalizeTargetEl.value = state.normalizeTarget;
  normalizeTargetValEl.textContent = `${state.normalizeTarget}%`;
  volumeEl.value = state.volume;
  volumeValEl.textContent = `${state.volume}%`;
  normalizeAudioEl.checked = state.normalizeAudio !== false;
  limiterEl.checked = state.limiter !== false;
  stereoPanEl.checked = !!state.stereoPan;
  stereoPanAmountEl.value = state.stereoPanAmount;
  stereoPanAmountValEl.textContent = `${state.stereoPanAmount}%`;
  progressiveEnabledEl.checked = !!state.progressiveEnabled;
  progressiveMinutesEl.value = state.progressiveMinutes;
  progressiveStartTilesEl.value = state.progressiveStartTiles;
  renderPresets();
  renderFolderSets();
  renderHistory();
  shuffleEl.checked = !!state.shuffle;
  edgeInsertsEl.checked = state.edgeInserts !== false;
  tileControlsEl.value = ['full', 'compact'].includes(state.tileControls) ? state.tileControls : 'auto';
  qualityFilterEl.checked = !!state.qualityFilter;
  minHeightEl.value = String(state.minHeight || 720);
  syncQualityFilter();
  imagesEnabledEl.checked = !!state.imagesEnabled;
  imageSecondsEl.value = state.imageSeconds;
  webcamEnabledEl.checked = !!state.webcamEnabled;
  webcamHeroEl.checked = state.webcamHero !== false;
  recordWebcamEl.checked = !!state.recordWebcam;
  recordBitrateEl.value = String(state.recordBitrate || 8);
  renderRecordFolder();
  syncRecordState();
  renderScreens();
  blankUnusedEl.checked = !!state.blankUnusedScreens;
  spanAllEl.checked = !!state.spanAllScreens;
  syncSpanState();
  breathingFields.breathingEnabled.checked = !!state.breathingEnabled;
  breathingFields.breathingSound.checked = !!state.breathingSound;
  breathingFields.breathingIntervalMin.value = state.breathingIntervalMin;
  breathingFields.breathsPerExercise.value = state.breathsPerExercise;
  breathingFields.inhaleSeconds.value = state.inhaleSeconds;
  breathingFields.holdSeconds.value = state.holdSeconds;
  breathingFields.exhaleSeconds.value = state.exhaleSeconds;
  breathingFields.holdAfterSeconds.value = state.holdAfterSeconds;
  renderPoppersBrand();
  renderNarration();
  narrationTextEl.checked = state.narrationText !== false;
  narrationAtStartEl.checked = state.narrationAtStart !== false;
  narrationBeforeBreathingEl.checked = !!state.narrationBeforeBreathing;
  renderGoalSound();
  musicEnabledEl.checked = !!state.musicEnabled;
  renderMusic();
  textEnabledEl.checked = !!state.textEnabled;
  textModeEl.value = state.textMode;
  renderPatternFolder();
  renderAffirmFolder();
  hypnoTextEl.value = state.hypnoText;
  hypnoOpacityEl.value = state.hypnoOpacity;
  hypnoOpacityValEl.textContent = `${state.hypnoOpacity}%`;
  breathingBeatSyncEl.checked = !!state.breathingBeatSync;
  videoBeatSyncEl.checked = !!state.videoBeatSync;
  hypnoCycleEl.checked = !!state.hypnoCycle;
  hypnoCycleSecondsEl.value = state.hypnoCycleSeconds;
  renderTextLines();
  goalEnabledEl.checked = !!state.goalEnabled;
  goalCountdownEl.checked = !!state.goalCountdown;
  goalMinutesEl.value = state.goalMinutes;
  bestInfoEl.textContent = fmtBest(state.personalBest);
  renderFolders();
  applyDensity();
  syncLamps();
  refreshSummaries();
  markPlace();
}

// A module's tally lamp lights when its subsystem is armed, so a glance down
// the rail tells you what the next session will include.
function syncLamps() {
  for (const mod of document.querySelectorAll('.module[data-lamp]')) {
    const live = mod.dataset.lamp.split(' ').some((key) => !!state[key]);
    mod.classList.toggle('live', live);
    const jump = document.querySelector(`.toc-btn[data-target="${mod.id}"]`);
    if (jump) jump.classList.toggle('live', live);
  }
}

// Priorities set from a tile land here so an open controls window stays in sync
// (and doesn't overwrite them on its next save).
window.controls.onPrefsUpdated((prefs) => {
  state.folderPrefs = prefs || {};
  renderFolders();
});

window.controls.onError((msg) => {
  errorEl.textContent = msg;
  startBtn.disabled = false;
  startBtn.textContent = 'Start ▶';
});

addFolderBtn.addEventListener('click', async () => {
  const picked = await window.controls.chooseFolders();
  let added = false;
  for (const f of picked) {
    if (!state.folders.includes(f)) { state.folders.push(f); added = true; }
  }
  if (added) { persist(); renderFolders(); renderScreens(); errorEl.textContent = ''; }
});

let clearFoldersTimer = null;
function setClearFoldersConfirming(confirming) {
  clearFoldersBtn.classList.toggle('confirming', confirming);
  clearFoldersLabelEl.textContent = confirming ? 'Click again to clear' : 'Clear all folders';
}

clearFoldersBtn.addEventListener('click', () => {
  if (!clearFoldersBtn.classList.contains('confirming')) {
    setClearFoldersConfirming(true);
    clearTimeout(clearFoldersTimer);
    clearFoldersTimer = setTimeout(() => {
      setClearFoldersConfirming(false);
    }, 4000);
    return;
  }

  clearTimeout(clearFoldersTimer);
  state.folders = [];
  state.imageFolders = [];
  state.folderPrefs = {};
  state.screenZones = (state.screenZones || []).map(() => []);
  setClearFoldersConfirming(false);
  persist();
  renderFolders();
  renderScreens();
  errorEl.textContent = '';
});

skipEl.addEventListener('change', () => {
  state.skipSeconds = Math.max(0, parseInt(skipEl.value, 10) || 0);
  skipEl.value = state.skipSeconds;
  persist();
});
function clampInt(el, min, max, fallback) {
  let v = parseInt(el.value, 10);
  if (isNaN(v)) v = fallback;
  v = Math.min(max, Math.max(min, v));
  el.value = v;
  return v;
}

windowCountEl.addEventListener('change', () => {
  state.windowCount = clampInt(windowCountEl, 1, 8, 1);
  renderScreens();
  persist();
});
function syncLengthSliders(driver) {
  let minIdx = parseInt(minLengthEl.value, 10) || 0;
  let maxIdx = parseInt(maxLengthEl.value, 10);
  if (isNaN(maxIdx)) maxIdx = STOPS.length - 1;
  // Keep min <= max by pushing the other slider.
  if (minIdx > maxIdx) {
    if (driver === 'min') { maxIdx = minIdx; maxLengthEl.value = maxIdx; }
    else { minIdx = maxIdx; minLengthEl.value = minIdx; }
  }
  state.minLength = STOPS[minIdx];
  state.maxLength = STOPS[maxIdx];
  refreshLengthLabels();
}
minLengthEl.addEventListener('input', () => syncLengthSliders('min'));
maxLengthEl.addEventListener('input', () => syncLengthSliders('max'));
minLengthEl.addEventListener('change', persist);
maxLengthEl.addEventListener('change', persist);

// Keep the min/max pair coherent — moving one pushes the other rather than
// letting them cross.
function syncBounds(minEl, maxEl, minKey, maxKey, driver) {
  let lo = clampInt(minEl, 1, 4, 1);
  let hi = clampInt(maxEl, 1, 4, 4);
  if (lo > hi) {
    if (driver === 'min') { hi = lo; maxEl.value = hi; } else { lo = hi; minEl.value = lo; }
  }
  state[minKey] = lo;
  state[maxKey] = hi;
  persist();
}
minColsEl.addEventListener('change', () => syncBounds(minColsEl, maxColsEl, 'minCols', 'maxCols', 'min'));
maxColsEl.addEventListener('change', () => syncBounds(minColsEl, maxColsEl, 'minCols', 'maxCols', 'max'));
minRowsEl.addEventListener('change', () => syncBounds(minRowsEl, maxRowsEl, 'minRows', 'maxRows', 'min'));
maxRowsEl.addEventListener('change', () => syncBounds(minRowsEl, maxRowsEl, 'minRows', 'maxRows', 'max'));

function syncLayoutMode() {
  document.body.classList.toggle('grid-mode', state.layoutMode === 'grid');
  document.body.classList.toggle('center-mode', state.layoutMode === 'center');
  // A fixed grid and the centre ring always swap clips in place, so the
  // toggle only has a say in best-fit mode.
  replaceInPlaceEl.disabled = state.layoutMode !== 'auto';
}
layoutModeEl.addEventListener('change', () => {
  state.layoutMode = layoutModeEl.value;
  syncLayoutMode();
  persist();
});
gridColsEl.addEventListener('change', () => { state.gridCols = clampInt(gridColsEl, 1, 6, 3); persist(); });
gridRowsEl.addEventListener('change', () => { state.gridRows = clampInt(gridRowsEl, 1, 4, 1); persist(); });
heroCellEl.addEventListener('change', () => { state.heroCell = heroCellEl.checked; persist(); });
heroSpanEl.addEventListener('change', () => { state.heroSpan = clampInt(heroSpanEl, 2, 3, 2); persist(); });
heroPositionEl.addEventListener('change', () => { state.heroPosition = heroPositionEl.value; persist(); });
centerSizeEl.addEventListener('input', () => {
  state.centerSize = parseInt(centerSizeEl.value, 10) || 50;
  centerSizeValEl.textContent = `${state.centerSize}%`;
});
centerSizeEl.addEventListener('change', persist);
surroundTilesEl.addEventListener('change', () => { state.surroundTiles = clampInt(surroundTilesEl, 4, 12, 8); persist(); });
roundRobinEl.addEventListener('change', () => { state.folderRoundRobin = roundRobinEl.checked; persist(); });
cooldownEl.addEventListener('change', () => { state.cooldownMinutes = clampInt(cooldownEl, 0, 600, 20); persist(); });
kenBurnsEl.addEventListener('change', () => { state.kenBurns = kenBurnsEl.checked; persist(); });
kenBurnsAmountEl.addEventListener('input', () => {
  state.kenBurnsAmount = parseInt(kenBurnsAmountEl.value, 10) || 1;
  kenBurnsAmountValEl.textContent = `${state.kenBurnsAmount}%`;
});
kenBurnsAmountEl.addEventListener('change', persist);
kenBurnsSecondsEl.addEventListener('change', () => { state.kenBurnsSeconds = clampInt(kenBurnsSecondsEl, 5, 600, 30); persist(); });
kenBurnsRotateEl.addEventListener('input', () => {
  state.kenBurnsRotate = parseInt(kenBurnsRotateEl.value, 10) || 0;
  kenBurnsRotateValEl.textContent = `${state.kenBurnsRotate}°`;
});
kenBurnsRotateEl.addEventListener('change', persist);
// Beat-synced and free-running drift use different timing fields; show the one
// that applies.
function syncDriftTiming() {
  document.body.classList.toggle('beat-drift', !!state.kenBurnsBeatSync);
}
kenBurnsBeatSyncEl.addEventListener('change', () => {
  state.kenBurnsBeatSync = kenBurnsBeatSyncEl.checked;
  syncDriftTiming();
  persist();
});
kenBurnsBeatsEl.addEventListener('change', () => { state.kenBurnsBeats = clampInt(kenBurnsBeatsEl, 1, 64, 16); persist(); });
kenBurnsCenterEl.addEventListener('change', () => { state.kenBurnsCenter = kenBurnsCenterEl.value; persist(); });
kenBurnsScopeEl.addEventListener('change', () => { state.kenBurnsScope = kenBurnsScopeEl.value; persist(); });
normalizeTargetEl.addEventListener('input', () => {
  state.normalizeTarget = parseInt(normalizeTargetEl.value, 10) || 0;
  normalizeTargetValEl.textContent = `${state.normalizeTarget}%`;
});
normalizeTargetEl.addEventListener('change', persist);
stereoPanEl.addEventListener('change', () => { state.stereoPan = stereoPanEl.checked; persist(); });
stereoPanAmountEl.addEventListener('input', () => {
  state.stereoPanAmount = parseInt(stereoPanAmountEl.value, 10) || 0;
  stereoPanAmountValEl.textContent = `${state.stereoPanAmount}%`;
});
stereoPanAmountEl.addEventListener('change', persist);
progressiveEnabledEl.addEventListener('change', () => { state.progressiveEnabled = progressiveEnabledEl.checked; persist(); });
progressiveMinutesEl.addEventListener('change', () => { state.progressiveMinutes = clampInt(progressiveMinutesEl, 1, 240, 20); persist(); });
progressiveStartTilesEl.addEventListener('change', () => { state.progressiveStartTiles = clampInt(progressiveStartTilesEl, 1, 8, 1); persist(); });

// Session history ------------------------------------------------------------

function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function renderHistory() {
  const history = state.sessionHistory || [];
  const videoHistory = state.videoHistory || [];
  const climaxHistory = state.climaxHistory || [];
  const videoOCounts = state.videoOCounts || {};
  historyGraphEl.innerHTML = '';
  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Sessions longer than 30 seconds are logged here.';
    historyGraphEl.appendChild(empty);
  }

  const total = history.reduce((a, h) => a + h.seconds, 0);
  const longest = history.length ? Math.max(...history.map((h) => h.seconds)) : 0;
  // A readout of four figures rather than one run-on sentence.
  historyStatsEl.innerHTML = '';
  const stats = [
    [String(history.length), history.length === 1 ? 'session' : 'sessions'],
    [fmtDuration(total), 'total'],
    [fmtDuration(history.length ? total / history.length : 0), 'average'],
    [fmtDuration(longest), 'longest'],
    [String(state.oCount || 0), 'O-count'],
    [String(climaxHistory.length), climaxHistory.length === 1 ? 'O event' : 'O events'],
  ];
  for (const [value, label] of stats) {
    const cell = document.createElement('div');
    cell.className = 'stat';
    const v = document.createElement('span');
    v.className = 'stat-value';
    v.textContent = value;
    const l = document.createElement('span');
    l.className = 'stat-label';
    l.textContent = label;
    cell.append(v, l);
    historyStatsEl.appendChild(cell);
  }

  // Newest on the right; only the most recent 60 fit comfortably.
  for (const h of history.slice(-60)) {
    const bar = document.createElement('div');
    bar.className = 'bar' + (h.seconds === longest ? ' best' : '');
    bar.style.height = `${Math.max(3, (h.seconds / longest) * 100)}%`;
    bar.title = `${new Date(h.at).toLocaleString()} — ${fmtDuration(h.seconds)}`;
    historyGraphEl.appendChild(bar);
  }

  renderHistoryList(
    oVideoListEl,
    Object.entries(videoOCounts)
      .sort((a, b) => b[1] - a[1] || baseName(a[0]).localeCompare(baseName(b[0])))
      .map(([file, count]) => ({ file: baseName(file), title: file, meta: `×${count}` })),
    'No videos have been O-marked yet.',
  );
  renderHistoryList(
    climaxHistoryListEl,
    climaxHistory.slice().reverse().map((event) => ({
      file: (event.videos || []).map(baseName).join(', '),
      title: (event.videos || []).join('\n'),
      meta: new Date(event.at).toLocaleString(),
    })),
    'Press O during playback to log every visible video.',
  );
  renderHistoryList(
    videoHistoryListEl,
    videoHistory.slice().reverse().map((event) => ({
      file: baseName(event.path),
      title: event.path,
      meta: new Date(event.at).toLocaleString(),
    })),
    'Videos will appear here as they are shown.',
  );
}

function renderHistoryList(container, rows, emptyText) {
  container.innerHTML = '';
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  for (const row of rows.slice(0, 200)) {
    const el = document.createElement('div');
    el.className = 'history-row';
    const file = document.createElement('span');
    file.className = 'history-path';
    file.textContent = row.file;
    file.title = row.title || row.file;
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = row.meta || '';
    el.append(file, meta);
    container.appendChild(el);
  }
}

clearHistoryBtn.addEventListener('click', () => {
  state.sessionHistory = [];
  state.videoHistory = [];
  state.climaxHistory = [];
  state.oCount = 0;
  state.videoOCounts = {};
  window.controls.clearHistory();
  renderHistory();
});

window.controls.onHistoryUpdated((history) => {
  if (Array.isArray(history)) state.sessionHistory = history;
  else Object.assign(state, history || {});
  renderHistory();
});

// Presets ---------------------------------------------------------------------
//
// A preset is a snapshot of everything currentConfig() covers except the
// library — folders, their roles, priorities and screen zones belong to folder
// sets — so loading one restores layout and overlays without touching what is
// playing from where.

const FOLDER_KEYS = ['folders', 'imageFolders', 'folderPrefs', 'screenZones'];

function withoutFolders(obj) {
  const out = { ...(obj || {}) };
  for (const k of FOLDER_KEYS) delete out[k];
  return out;
}

function presetPayload() {
  return withoutFolders(currentConfig());
}

function renderPresets() {
  const names = Object.keys(state.presets || {}).sort();
  presetSelectEl.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = names.length ? '— pick a preset —' : '— none saved —';
  presetSelectEl.appendChild(none);
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    presetSelectEl.appendChild(opt);
  }
  presetSelectEl.value = names.includes(state.activePreset) ? state.activePreset : '';
  const active = presetSelectEl.value;
  presetInfoEl.textContent = active
    ? `“${active}” loaded — Save overwrites it with the current settings.`
    : 'Save as… stores the current settings under a new name.';
  savePresetBtn.disabled = !active;
  deletePresetBtn.disabled = !active;
}

presetSelectEl.addEventListener('change', () => {
  const name = presetSelectEl.value;
  if (!name) { state.activePreset = ''; renderPresets(); persist(); return; }
  const preset = (state.presets || {})[name];
  if (!preset) return;
  // Keep the things a preset has no business overwriting — the folder keys
  // are stripped too, in case an old preset still carries them.
  const { presets, sessionHistory, personalBest, folderSets, activeFolderSet } = state;
  state = {
    ...state, ...withoutFolders(preset),
    presets, sessionHistory, personalBest, folderSets, activeFolderSet, activePreset: name,
  };
  applyStateToUI();
  persist();
});

savePresetBtn.addEventListener('click', () => {
  const name = presetSelectEl.value;
  if (!name) return;
  state.presets = { ...state.presets, [name]: presetPayload() };
  renderPresets();
  persist();
});

savePresetAsBtn.addEventListener('click', async () => {
  const name = await askName('Name this preset', suggestPresetName());
  if (!name) return;
  state.presets = { ...state.presets, [name]: presetPayload() };
  state.activePreset = name;
  renderPresets();
  persist();
});

deletePresetBtn.addEventListener('click', () => {
  const name = presetSelectEl.value;
  if (!name) return;
  const presets = { ...state.presets };
  delete presets[name];
  state.presets = presets;
  if (state.activePreset === name) state.activePreset = '';
  renderPresets();
  persist();
});

// Folder sets -----------------------------------------------------------------
//
// A folder set is the library half of what a preset used to be: the folder
// list with each folder's roles, priorities and screen zones. Loading one
// swaps the whole list; the change takes effect on the next Start, like any
// other edit to the folders.

function folderSetPayload() {
  return {
    folders: [...(state.folders || [])],
    imageFolders: [...(state.imageFolders || [])],
    folderPrefs: { ...(state.folderPrefs || {}) },
    screenZones: (state.screenZones || []).map((z) => [...(z || [])]),
  };
}

function renderFolderSets() {
  const names = Object.keys(state.folderSets || {}).sort();
  folderSetSelectEl.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = names.length ? '— pick a folder set —' : '— no folder sets saved —';
  folderSetSelectEl.appendChild(none);
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    folderSetSelectEl.appendChild(opt);
  }
  folderSetSelectEl.value = names.includes(state.activeFolderSet) ? state.activeFolderSet : '';
  const active = folderSetSelectEl.value;
  folderSetInfoEl.textContent = active
    ? `“${active}” loaded — Save overwrites it with the folders below.`
    : 'Save as… stores the folders below under a new name.';
  saveFolderSetBtn.disabled = !active;
  deleteFolderSetBtn.disabled = !active;
}

folderSetSelectEl.addEventListener('change', () => {
  const name = folderSetSelectEl.value;
  if (!name) { state.activeFolderSet = ''; renderFolderSets(); persist(); return; }
  const set = (state.folderSets || {})[name];
  if (!set) return;
  state.folders = [...(set.folders || [])];
  state.imageFolders = [...(set.imageFolders || [])];
  state.folderPrefs = { ...(set.folderPrefs || {}) };
  state.screenZones = (set.screenZones || []).map((z) => [...(z || [])]);
  state.activeFolderSet = name;
  renderFolderSets();
  renderScreens(); // repaints the folder list too
  persist();
});

saveFolderSetBtn.addEventListener('click', () => {
  const name = folderSetSelectEl.value;
  if (!name) return;
  state.folderSets = { ...state.folderSets, [name]: folderSetPayload() };
  renderFolderSets();
  persist();
});

saveFolderSetAsBtn.addEventListener('click', async () => {
  const name = await askName('Name this folder set', suggestFolderSetName());
  if (!name) return;
  state.folderSets = { ...state.folderSets, [name]: folderSetPayload() };
  state.activeFolderSet = name;
  renderFolderSets();
  persist();
});

deleteFolderSetBtn.addEventListener('click', () => {
  const name = folderSetSelectEl.value;
  if (!name) return;
  const sets = { ...state.folderSets };
  delete sets[name];
  state.folderSets = sets;
  if (state.activeFolderSet === name) state.activeFolderSet = '';
  renderFolderSets();
  persist();
});

// The first folder's name, or a count, as a starting point for the name box.
function suggestFolderSetName() {
  const folders = allFolders();
  if (!folders.length) return '';
  const first = prefLabel(folders[0]);
  return folders.length === 1 ? first : `${first} + ${folders.length - 1} more`;
}

// A starting point for the name box, based on the current layout.
function suggestPresetName() {
  const shape = state.layoutMode === 'grid'
    ? `${state.gridCols}x${state.gridRows}${state.heroCell ? ' hero' : ''}`
    : state.layoutMode === 'center' ? `centre + ${state.surroundTiles}` : 'best fit';
  const shot = state.orientation === 'any' ? '' : ` ${state.orientation}`;
  return `${shape}${shot}`;
}
orientationEl.addEventListener('change', () => { state.orientation = orientationEl.value; persist(); });
replaceInPlaceEl.addEventListener('change', () => { state.replaceInPlace = replaceInPlaceEl.checked; persist(); });

volumeEl.addEventListener('input', () => {
  state.volume = parseInt(volumeEl.value, 10) || 0;
  volumeValEl.textContent = `${state.volume}%`;
});
volumeEl.addEventListener('change', persist);
normalizeAudioEl.addEventListener('change', () => { state.normalizeAudio = normalizeAudioEl.checked; persist(); });
limiterEl.addEventListener('change', () => { state.limiter = limiterEl.checked; persist(); });

// Same short label the tiles show: rooted at the watched folder's own name.
function prefLabel(folder) {
  const norm = (x) => x.replace(/\\/g, '/').replace(/\/+$/, '');
  const f = norm(folder);
  let root = '';
  for (const w of state.folders || []) {
    const n = norm(w);
    if ((f === n || f.startsWith(n + '/')) && n.length > root.length) root = n;
  }
  if (!root) return f.split('/').pop();
  const parent = root.split('/').slice(0, -1).join('/');
  return f.slice(parent ? parent.length + 1 : 0).split('/').join(' / ');
}

shuffleEl.addEventListener('change', () => { state.shuffle = shuffleEl.checked; persist(); });
edgeInsertsEl.addEventListener('change', () => { state.edgeInserts = edgeInsertsEl.checked; persist(); });
tileControlsEl.addEventListener('change', () => { state.tileControls = tileControlsEl.value; persist(); });
// The threshold only means anything while the filter is on.
function syncQualityFilter() {
  minHeightEl.disabled = !qualityFilterEl.checked;
}
qualityFilterEl.addEventListener('change', () => {
  state.qualityFilter = qualityFilterEl.checked;
  syncQualityFilter();
  persist();
});
minHeightEl.addEventListener('change', () => { state.minHeight = parseInt(minHeightEl.value, 10) || 720; persist(); });
imagesEnabledEl.addEventListener('change', () => { state.imagesEnabled = imagesEnabledEl.checked; persist(); });
imageSecondsEl.addEventListener('change', () => { state.imageSeconds = clampInt(imageSecondsEl, 1, 600, 12); persist(); });

webcamEnabledEl.addEventListener('change', () => {
  state.webcamEnabled = webcamEnabledEl.checked;
  syncRecordState(); // there is nothing to record without a camera tile
  persist();
});
webcamHeroEl.addEventListener('change', () => { state.webcamHero = webcamHeroEl.checked; persist(); });
webcamScreenEl.addEventListener('change', () => { state.webcamScreen = parseInt(webcamScreenEl.value, 10) || 0; persist(); });

// Camera recording only matters when there is a camera tile to capture.
function syncRecordState() {
  const camera = !!state.recordWebcam && !!state.webcamEnabled;
  recordBitrateEl.disabled = !camera;
  chooseRecordFolderBtn.disabled = !camera;
  clearRecordFolderBtn.disabled = !camera;
  recordWebcamEl.disabled = !state.webcamEnabled;
  recordWebcamEl.parentElement.style.opacity = state.webcamEnabled ? '' : '0.5';
}
function renderRecordFolder() {
  recordFolderInfoEl.textContent = state.recordFolder || recordFolderDefault || 'Chosen when recording starts';
}
recordWebcamEl.addEventListener('change', () => { state.recordWebcam = recordWebcamEl.checked; syncRecordState(); persist(); });
recordBitrateEl.addEventListener('change', () => { state.recordBitrate = parseInt(recordBitrateEl.value, 10) || 8; persist(); });
chooseRecordFolderBtn.addEventListener('click', async () => {
  const f = await window.controls.chooseRecordFolder();
  if (f) { state.recordFolder = f; renderRecordFolder(); persist(); }
});
clearRecordFolderBtn.addEventListener('click', () => {
  state.recordFolder = '';
  renderRecordFolder();
  persist();
});

// How many player windows there will be, which drives the zone rows and the
// camera's screen picker.
function screenCount() {
  if (state.spanAllScreens) return 1;
  return Math.max(1, state.windowCount || 1);
}

// The screen pickers follow however many player windows there will be.
function renderScreens() {
  const count = screenCount();

  webcamScreenEl.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `Screen ${i + 1}`;
    webcamScreenEl.appendChild(opt);
  }
  webcamScreenEl.value = String(Math.min(state.webcamScreen || 0, count - 1));
  state.webcamScreen = parseInt(webcamScreenEl.value, 10) || 0;

  renderFolders();

}

blankUnusedEl.addEventListener('change', () => { state.blankUnusedScreens = blankUnusedEl.checked; persist(); });
spanAllEl.addEventListener('change', () => {
  state.spanAllScreens = spanAllEl.checked;
  // Apply sensible grid defaults for the chosen mode.
  if (state.spanAllScreens) { state.maxCols = 2; state.maxRows = 2; }
  else { state.maxCols = 3; state.maxRows = 1; }
  state.minCols = Math.min(state.minCols, state.maxCols);
  state.minRows = Math.min(state.minRows, state.maxRows);
  maxColsEl.value = state.maxCols;
  maxRowsEl.value = state.maxRows;
  minColsEl.value = state.minCols;
  minRowsEl.value = state.minRows;
  syncSpanState();
  renderScreens();
  persist();
});

// Window-count / blank options are irrelevant when spanning, so grey them out.
function syncSpanState() {
  const on = spanAllEl.checked;
  windowCountEl.disabled = on;
  blankUnusedEl.disabled = on;
}

// Breathing controls
musicEnabledEl.addEventListener('change', () => { state.musicEnabled = musicEnabledEl.checked; persist(); });
chooseMusicBtn.addEventListener('click', async () => {
  const f = await window.controls.chooseMusic();
  if (f) { state.musicFile = f; persist(); renderMusic(); }
});
choosePatternFolderBtn.addEventListener('click', async () => {
  const f = await window.controls.choosePatternFolder();
  if (f) { state.patternFolder = f; renderPatternFolder(); persist(); }
});
clearPatternFolderBtn.addEventListener('click', () => { state.patternFolder = ''; renderPatternFolder(); persist(); });
chooseAffirmFolderBtn.addEventListener('click', async () => {
  const f = await window.controls.chooseAffirmationFolder();
  if (f) { state.affirmationFolder = f; renderAffirmFolder(); persist(); }
});
clearAffirmFolderBtn.addEventListener('click', () => { state.affirmationFolder = ''; renderAffirmFolder(); persist(); });
textEnabledEl.addEventListener('change', () => { state.textEnabled = textEnabledEl.checked; persist(); });
textModeEl.addEventListener('change', () => { state.textMode = textModeEl.value; persist(); });
hypnoTextEl.addEventListener('change', () => { state.hypnoText = hypnoTextEl.value; persist(); });
hypnoOpacityEl.addEventListener('input', () => { state.hypnoOpacity = parseInt(hypnoOpacityEl.value, 10) || 18; hypnoOpacityValEl.textContent = `${state.hypnoOpacity}%`; });
hypnoOpacityEl.addEventListener('change', persist);
hypnoCycleEl.addEventListener('change', () => { state.hypnoCycle = hypnoCycleEl.checked; persist(); });
hypnoCycleSecondsEl.addEventListener('change', () => { state.hypnoCycleSeconds = clampInt(hypnoCycleSecondsEl, 4, 300, 20); persist(); });
chooseTextFileBtn.addEventListener('click', async () => {
  const lines = await window.controls.chooseTextFile();
  if (lines && lines.length) { state.hypnoLines = lines; renderTextLines(); persist(); }
});
clearTextFileBtn.addEventListener('click', () => { state.hypnoLines = []; renderTextLines(); persist(); });
breathingBeatSyncEl.addEventListener('change', () => { state.breathingBeatSync = breathingBeatSyncEl.checked; persist(); });
videoBeatSyncEl.addEventListener('change', () => { state.videoBeatSync = videoBeatSyncEl.checked; persist(); });
goalEnabledEl.addEventListener('change', () => { state.goalEnabled = goalEnabledEl.checked; persist(); });
goalCountdownEl.addEventListener('change', () => { state.goalCountdown = goalCountdownEl.checked; persist(); });
goalMinutesEl.addEventListener('change', () => { state.goalMinutes = clampInt(goalMinutesEl, 0, 240, 0); persist(); });
resetBestBtn.addEventListener('click', () => {
  state.personalBest = 0;
  bestInfoEl.textContent = fmtBest(0);
  window.controls.updateConfig({ personalBest: 0 }); // reset directly without clobbering live best
});

poppersBrandEl.addEventListener('change', () => {
  state.poppersBrand = poppersBrandEl.value;
  renderPoppersBrand();
  persist();
});
chooseNarrationBtn.addEventListener('click', async () => {
  const f = await window.controls.chooseAudioFile('Choose a spoken command track');
  if (f) { state.narrationFile = f; renderNarration(); persist(); }
});
clearNarrationBtn.addEventListener('click', () => { state.narrationFile = ''; renderNarration(); persist(); });
narrationTextEl.addEventListener('change', () => { state.narrationText = narrationTextEl.checked; persist(); });
narrationAtStartEl.addEventListener('change', () => { state.narrationAtStart = narrationAtStartEl.checked; persist(); });
narrationBeforeBreathingEl.addEventListener('change', () => { state.narrationBeforeBreathing = narrationBeforeBreathingEl.checked; persist(); });
chooseGoalSoundBtn.addEventListener('click', async () => {
  const f = await window.controls.chooseAudioFile('Choose the countdown sound');
  if (f) { state.goalCountdownSound = f; renderGoalSound(); persist(); }
});
clearGoalSoundBtn.addEventListener('click', () => { state.goalCountdownSound = ''; renderGoalSound(); persist(); });
breathingFields.breathingEnabled.addEventListener('change', () => { state.breathingEnabled = breathingFields.breathingEnabled.checked; persist(); });
breathingFields.breathingSound.addEventListener('change', () => { state.breathingSound = breathingFields.breathingSound.checked; persist(); });
for (const key of Object.keys(BREATHING_BOUNDS)) {
  const el = breathingFields[key];
  const [min, max] = BREATHING_BOUNDS[key];
  el.addEventListener('change', () => { state[key] = clampInt(el, min, max, state[key]); persist(); });
}

startBtn.addEventListener('click', () => {
  if (!initialized || state.folders.length === 0) return;
  errorEl.textContent = '';
  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';
  window.controls.start(currentConfig());
});

function currentConfig() {
  return {
    folders: state.folders,
    skipSeconds: state.skipSeconds,
    shuffle: state.shuffle,
    layoutMode: state.layoutMode,
    gridCols: state.gridCols,
    gridRows: state.gridRows,
    maxCols: state.maxCols,
    maxRows: state.maxRows,
    minCols: state.minCols,
    minRows: state.minRows,
    heroCell: state.heroCell,
    heroSpan: state.heroSpan,
    heroPosition: state.heroPosition,
    centerSize: state.centerSize,
    surroundTiles: state.surroundTiles,
    folderRoundRobin: state.folderRoundRobin,
    cooldownMinutes: state.cooldownMinutes,
    orientation: state.orientation,
    replaceInPlace: state.replaceInPlace,
    edgeInserts: state.edgeInserts,
    tileControls: state.tileControls,
    qualityFilter: state.qualityFilter,
    minHeight: state.minHeight,
    imagesEnabled: state.imagesEnabled,
    imageFolders: state.imageFolders,
    condensed: state.condensed,
    imageSeconds: state.imageSeconds,
    screenZones: state.screenZones,
    webcamEnabled: state.webcamEnabled,
    webcamScreen: state.webcamScreen,
    webcamHero: state.webcamHero,
    recordWebcam: state.recordWebcam,
    recordBitrate: state.recordBitrate,
    recordFolder: state.recordFolder,
    stereoPan: state.stereoPan,
    stereoPanAmount: state.stereoPanAmount,
    kenBurns: state.kenBurns,
    kenBurnsAmount: state.kenBurnsAmount,
    kenBurnsSeconds: state.kenBurnsSeconds,
    kenBurnsRotate: state.kenBurnsRotate,
    kenBurnsBeatSync: state.kenBurnsBeatSync,
    kenBurnsBeats: state.kenBurnsBeats,
    kenBurnsCenter: state.kenBurnsCenter,
    kenBurnsScope: state.kenBurnsScope,
    normalizeTarget: state.normalizeTarget,
    progressiveEnabled: state.progressiveEnabled,
    progressiveMinutes: state.progressiveMinutes,
    progressiveStartTiles: state.progressiveStartTiles,
    folderPrefs: state.folderPrefs,
    volume: state.volume,
    normalizeAudio: state.normalizeAudio,
    limiter: state.limiter,
    windowCount: state.windowCount,
    blankUnusedScreens: state.blankUnusedScreens,
    spanAllScreens: state.spanAllScreens,
    minLength: state.minLength,
    maxLength: state.maxLength,
    breathingEnabled: state.breathingEnabled,
    breathingIntervalMin: state.breathingIntervalMin,
    breathsPerExercise: state.breathsPerExercise,
    inhaleSeconds: state.inhaleSeconds,
    holdSeconds: state.holdSeconds,
    exhaleSeconds: state.exhaleSeconds,
    holdAfterSeconds: state.holdAfterSeconds,
    breathingSound: state.breathingSound,
    poppersBrand: state.poppersBrand,
    musicEnabled: state.musicEnabled,
    musicFile: state.musicFile,
    patternFolder: state.patternFolder,
    hypnoOpacity: state.hypnoOpacity,
    hypnoCycle: state.hypnoCycle,
    hypnoCycleSeconds: state.hypnoCycleSeconds,
    textEnabled: state.textEnabled,
    textMode: state.textMode,
    hypnoText: state.hypnoText,
    hypnoLines: state.hypnoLines,
    affirmationFolder: state.affirmationFolder,
    breathingBeatSync: state.breathingBeatSync,
    videoBeatSync: state.videoBeatSync,
    goalEnabled: state.goalEnabled,
    goalCountdown: state.goalCountdown,
    goalMinutes: state.goalMinutes,
    goalCountdownSound: state.goalCountdownSound,
    narrationFile: state.narrationFile,
    narrationText: state.narrationText,
    narrationAtStart: state.narrationAtStart,
    narrationBeforeBreathing: state.narrationBeforeBreathing,
    // personalBest intentionally omitted — it's owned/updated live by main.
  };
}

// The preset and folder-set libraries are added only here, not in
// currentConfig() — otherwise every saved preset would contain a copy of all
// the others. sessionHistory and personalBest stay out entirely; main owns those.
function persist() {
  syncLamps();
  refreshSummaries();
  if (!initialized) return;
  window.controls.updateConfig({
    ...currentConfig(),
    presets: state.presets,
    activePreset: state.activePreset,
    folderSets: state.folderSets,
    activeFolderSet: state.activeFolderSet,
  });
}


// ── The folder list ─────────────────────────────────────────────────────────
//
// One row per folder, whatever part it plays. The four things that used to be
// set in four different places — which folders hold clips, which hold stills,
// which are preferred or avoided, and which screen a folder belongs to — are
// all chips on the folder's own row.

function allFolders() {
  const seen = new Set();
  const out = [];
  const add = (f) => { if (f && !seen.has(f)) { seen.add(f); out.push(f); } };
  (state.folders || []).forEach(add);
  (state.imageFolders || []).forEach(add);
  for (const [f, level] of Object.entries(state.folderPrefs || {})) if (level) add(f);
  // Ordered by path so rows never move when you press a chip, and so a
  // subfolder's priority row sits directly under the folder it came from.
  return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function inList(key, folder) {
  return (state[key] || []).includes(folder);
}

function toggleList(key, folder) {
  const list = [...(state[key] || [])];
  const at = list.indexOf(folder);
  if (at === -1) list.push(folder); else list.splice(at, 1);
  state[key] = list;
}

function zonesFor(folder) {
  return (state.screenZones || []).reduce((acc, zone, i) => {
    if ((zone || []).includes(folder)) acc.push(i);
    return acc;
  }, []);
}

function toggleZone(folder, index) {
  const zones = [];
  for (let i = 0; i < Math.max(screenCount(), (state.screenZones || []).length); i++) {
    zones.push([...((state.screenZones || [])[i] || [])]);
  }
  const zone = zones[index];
  const at = zone.indexOf(folder);
  if (at === -1) zone.push(folder); else zone.splice(at, 1);
  state.screenZones = zones;
}

// Prefer and avoid are one setting with two buttons, so it can only ever hold
// one of them. Pressing the one already set clears it.
function setPref(folder, want) {
  const prefs = { ...(state.folderPrefs || {}) };
  if ((prefs[folder] || 0) === want) delete prefs[folder];
  else prefs[folder] = want;
  state.folderPrefs = prefs;
}

function chip({ iconName, text, on, disabled, title, onClick }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip' + (on ? ' on' : '');
  b.title = title;
  b.disabled = !!disabled;
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (iconName) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${iconName}`);
    svg.appendChild(use);
    b.appendChild(svg);
  }
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    b.appendChild(span);
  }
  b.addEventListener('click', onClick);
  return b;
}

function renderFolders() {
  const folders = allFolders();
  folderListEl.innerHTML = '';
  clearFoldersBtn.disabled = folders.length === 0;
  if (folders.length === 0) setClearFoldersConfirming(false);

  const playable = (state.folders || []).length
    || (state.imagesEnabled && (state.imageFolders || []).length);
  startBtn.disabled = !playable;

  if (folders.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Add a folder to get started.';
    folderListEl.appendChild(li);
    return;
  }

  const screens = screenCount();
  for (const folder of folders) {
    const li = document.createElement('li');
    li.className = 'folder-row';

    const head = document.createElement('div');
    head.className = 'folder-head';
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = prefLabel(folder);
    const full = document.createElement('span');
    full.className = 'folder-path';
    full.textContent = folder;
    full.title = folder;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'remove';
    rm.textContent = '✕';
    rm.title = 'Remove this folder';
    rm.addEventListener('click', () => {
      state.folders = (state.folders || []).filter((f) => f !== folder);
      state.imageFolders = (state.imageFolders || []).filter((f) => f !== folder);
      state.screenZones = (state.screenZones || []).map((z) => (z || []).filter((f) => f !== folder));
      if (state.folderPrefs) delete state.folderPrefs[folder];
      persist();
      renderFolders();
    });
    head.append(name, full, rm);

    const roles = document.createElement('div');
    roles.className = 'folder-roles';
    const level = (state.folderPrefs || {})[folder] || 0;
    const redraw = () => { persist(); renderFolders(); };

    // A row is either a source the library scans, or a priority set on a
    // subfolder of one (the ★ / ⊘ buttons on a tile put those here). A source
    // has to serve something, so the last of clips/stills locks on — and a
    // priority row's only setting locks too. Rows go away with ✕, not by being
    // switched off until nothing is left.
    const clips = inList('folders', folder);
    const stills = inList('imageFolders', folder);
    const isSource = clips || stills;
    const lockedRole = 'A folder has to serve clips or stills — turn the other one on first';
    const notASource = 'Plays as part of the folder above it; this row only sets its priority';

    roles.appendChild(chip({
      iconName: 'film',
      text: 'Clips',
      on: clips,
      disabled: !isSource || (clips && !stills),
      title: !isSource ? notASource : (clips && !stills ? lockedRole : 'Take videos from this folder'),
      onClick: () => { toggleList('folders', folder); redraw(); },
    }));
    roles.appendChild(chip({
      iconName: 'image',
      text: 'Stills',
      on: stills,
      disabled: !isSource || (stills && !clips),
      title: !isSource ? notASource : (stills && !clips ? lockedRole : 'Take images from this folder'),
      onClick: () => { toggleList('imageFolders', folder); redraw(); },
    }));
    roles.appendChild(chip({
      iconName: 'star',
      text: 'Prefer',
      on: level > 0,
      disabled: !isSource && level > 0,
      title: !isSource && level > 0 ? 'Remove this row with ✕' : 'Play this folder next',
      onClick: () => { setPref(folder, 1); redraw(); },
    }));
    roles.appendChild(chip({
      iconName: 'ban',
      text: 'Avoid',
      on: level < 0,
      disabled: !isSource && level < 0,
      title: !isSource && level < 0 ? 'Remove this row with ✕' : 'Push this folder to the back',
      onClick: () => { setPref(folder, -1); redraw(); },
    }));

    if (screens > 1) {
      const mine = zonesFor(folder);
      const sep = document.createElement('span');
      sep.className = 'chip-sep';
      roles.appendChild(sep);
      for (let i = 0; i < screens; i++) {
        roles.appendChild(chip({
          iconName: 'monitor',
          text: String(i + 1),
          on: mine.includes(i),
          disabled: !isSource,
          title: isSource
            ? `Only show this folder on screen ${i + 1}`
            : notASource,
          onClick: () => { toggleZone(folder, i); redraw(); },
        }));
      }
    }

    li.append(head, roles);
    folderListEl.appendChild(li);
  }
}

// ── Panel chrome: collapsing, the jump list, and detail level ───────────────

const modules = [...document.querySelectorAll('.module')];
const tocButtons = [...document.querySelectorAll('.toc-btn')];

function setOpen(mod, open) {
  mod.classList.toggle('open', open);
  mod.querySelector('.rail-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
  mod.querySelector('.controls').hidden = !open;
}

for (const mod of modules) {
  mod.querySelector('.rail-btn').addEventListener('click', () => {
    setOpen(mod, !mod.classList.contains('open'));
  });
}

for (const btn of tocButtons) {
  btn.addEventListener('click', () => {
    const mod = document.getElementById(btn.dataset.target);
    if (!mod) return;
    setOpen(mod, true);
    mod.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

// The jump list names whichever section you are currently looking at.
let tocPending = false;
function markPlace() {
  const line = (document.querySelector('.toc')?.getBoundingClientRect().bottom || 0) + 8;
  let here = modules[0];
  for (const mod of modules) {
    if (mod.getBoundingClientRect().top <= line) here = mod;
  }
  const name = here.querySelector('.mod-name').textContent;
  tocHereEl.textContent = name;
  for (const btn of tocButtons) btn.classList.toggle('here', btn.dataset.target === here.id);
}
window.addEventListener('scroll', () => {
  if (tocPending) return;
  tocPending = true;
  requestAnimationFrame(() => { tocPending = false; markPlace(); });
}, { passive: true });

function applyDensity() {
  document.body.classList.toggle('condensed', !!state.condensed);
  viewDetailedEl.classList.toggle('on', !state.condensed);
  viewCondensedEl.classList.toggle('on', !!state.condensed);
}
viewDetailedEl.addEventListener('click', () => { state.condensed = false; applyDensity(); persist(); });
viewCondensedEl.addEventListener('click', () => { state.condensed = true; applyDensity(); persist(); });

// What each collapsed section says about itself, so the closed panel still
// reads as a summary of the session you are about to start.
function summaryFor(id) {
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const join = (parts) => parts.filter(Boolean).join(', ');
  switch (id) {
    case 'm-folders': {
      const n = allFolders().length;
      return join([n ? plural(n, 'folder') : 'none yet', state.activeFolderSet]);
    }
    case 'm-presets':
      return state.activePreset || 'none loaded';
    case 'm-queue':
      return join([
        state.shuffle ? 'shuffled' : 'in order',
        state.qualityFilter ? `${state.minHeight}p and up` : '',
        state.imagesEnabled ? 'with stills' : '',
      ]);
    case 'm-screens':
      return state.spanAllScreens ? 'one spanned window' : plural(screenCount(), 'window');
    case 'm-layout':
      if (state.layoutMode === 'grid') {
        return join([`grid ${state.gridCols} × ${state.gridRows}`, state.heroCell ? 'hero cell' : '']);
      }
      if (state.layoutMode === 'center') {
        return join([`centre at ${state.centerSize}%`, `${state.surroundTiles} around it`]);
      }
      return join(['best fit', `${state.minCols}–${state.maxCols} across`]);
    case 'm-audio':
      return join([`${state.volume}%`, state.normalizeAudio ? 'auto-levelled' : '', state.stereoPan ? 'panned' : '']);
    case 'm-camera':
      return state.webcamEnabled
        ? join([`screen ${(state.webcamScreen || 0) + 1}`, state.webcamHero ? 'lead cell' : '', state.recordWebcam ? 'recording' : ''])
        : 'off';
    case 'm-hypno':
      return join([
        state.kenBurns ? 'drift' : '',
        state.musicEnabled ? `${Math.round(state.bpm || 0)} bpm` : '',
        state.hypnoCycle ? 'cycling patterns' : '',
        state.textEnabled ? (textModeEl.selectedOptions[0]?.textContent || 'text on').toLowerCase() : '',
        state.narrationFile ? `voice: ${baseName(state.narrationFile).replace(/\.[^.]+$/, '')}` : '',
      ]) || 'off';
    case 'm-breathing':
      return state.breathingEnabled ? `every ${state.breathingIntervalMin} min` : 'off';
    case 'm-goal':
      return join([
        state.goalEnabled ? (state.goalMinutes ? `${state.goalMinutes} min` : 'beat your best') : 'off',
        state.goalEnabled && state.goalCountdownSound ? 'with sound' : '',
        state.progressiveEnabled ? 'ramping up' : '',
      ]);
    case 'm-history': {
      const sessions = (state.sessionHistory || []).length;
      return join([sessions ? plural(sessions, 'session') : '', `${state.oCount || 0} O-count`]);
    }
    default:
      return '';
  }
}

function refreshSummaries() {
  for (const mod of modules) {
    const el = mod.querySelector('.summary');
    if (el) el.textContent = summaryFor(mod.id);
  }
}

window.controls.ready();
