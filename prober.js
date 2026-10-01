'use strict';

// Reads real video dimensions by loading metadata only, then reports back to main.

const PROBE_TIMEOUT = 8000; // ms per file before giving up

window.prober.onProbe(({ requestId, paths }) => {
  Promise.all(paths.map(probeOne)).then((results) => {
    window.prober.probeResult({ requestId, results });
  });
});

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'];

function isImage(filePath) {
  const lower = filePath.toLowerCase();
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
}

// Stills report their pixel size and no duration, so the layout can shape a tile
// for them the same way it does for a video.
function probeImage(filePath) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (w, h) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ path: filePath, width: w, height: h, duration: null });
    };
    const timer = setTimeout(() => finish(16, 9), PROBE_TIMEOUT);
    img.onload = () => finish(img.naturalWidth || 16, img.naturalHeight || 9);
    img.onerror = () => finish(16, 9);
    img.src = pathToFileUrl(filePath);
  });
}

function probeOne(filePath) {
  if (isImage(filePath)) return probeImage(filePath);
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    let done = false;
    const finish = (w, h, duration) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve({ path: filePath, width: w, height: h, duration });
    };

    const timer = setTimeout(() => finish(16, 9, null), PROBE_TIMEOUT);

    video.addEventListener('loadedmetadata', () => {
      const dur = isFinite(video.duration) ? video.duration : null;
      finish(video.videoWidth || 16, video.videoHeight || 9, dur);
    });
    video.addEventListener('error', () => finish(16, 9, null));

    video.src = pathToFileUrl(filePath);
  });
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

window.prober.ready();
