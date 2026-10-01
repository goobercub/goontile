'use strict';

const MAX_TILES = 6;
const TILE_PENALTY = 0.02; // mild bias toward fewer, larger tiles
const CENTER_MIN_TILES = 5;      // the centre plus at least one tile in each band
const CENTER_MAX_SURROUND = 12;  // most tiles the ring around the centre may hold
const CENTER_MAX_SLICES = 6;     // most tiles one band of the ring may be cut into
const RS = [0.5, 0.38, 0.62]; // split ratios for asymmetric (mixed) templates

// ── Template builders (all in a 0..1 unit square) ─────────────────────────────

function cols(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([i / n, 0, 1 / n, 1]);
  return out;
}
function rows(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([0, i / n, 1, 1 / n]);
  return out;
}
function grid(c, r) {
  const out = [];
  for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) out.push([x / c, y / r, 1 / c, 1 / r]);
  return out;
}
// A forced cols x rows grid holding exactly `n` tiles. Rows are only used as
// needed, and a partial final row spreads its tiles across the full width so
// there are never empty cells.
function fixedGrid(colsN, rowsN, n) {
  const rowsUsed = Math.max(1, Math.min(rowsN, Math.ceil(n / colsN)));
  const rowH = 1 / rowsUsed;
  const out = [];
  let placed = 0;
  for (let r = 0; r < rowsUsed && placed < n; r++) {
    const inRow = Math.min(colsN, n - placed);
    const cw = 1 / inRow;
    for (let c = 0; c < inRow; c++) out.push([c * cw, r * rowH, cw, rowH]);
    placed += inRow;
  }
  return out;
}

// A forced grid with one oversized "hero" cell spanning `span` x `span` of the
// grid, the remaining cells filling around it in reading order. Returns null if
// the grid is too small to hold a hero plus at least one ordinary tile, so the
// caller can fall back to a plain grid.
function heroGrid(colsN, rowsN, span, position) {
  const s = Math.max(2, Math.min(span, colsN, rowsN));
  const capacity = colsN * rowsN - s * s + 1;
  if (capacity < 2) return null;

  const maxX = colsN - s;
  const maxY = rowsN - s;
  const pos = String(position || 'top-left');
  const hx = pos.includes('right') ? maxX : pos.includes('center') ? Math.floor(maxX / 2) : 0;
  const hy = pos.includes('bottom') ? maxY : pos.includes('center') ? Math.floor(maxY / 2) : 0;

  const cw = 1 / colsN;
  const ch = 1 / rowsN;
  const out = [[hx * cw, hy * ch, s * cw, s * ch]];
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < colsN; c++) {
      const insideHero = c >= hx && c < hx + s && r >= hy && r < hy + s;
      if (!insideHero) out.push([c * cw, r * ch, cw, ch]);
    }
  }
  return out;
}

function placeIn(rect, tmpl) {
  const [X, Y, W, H] = rect;
  return tmpl.map(([x, y, w, h]) => [X + x * W, Y + y * H, w * W, h * H]);
}
function splitV(ratio, left, right) {
  return placeIn([0, 0, ratio, 1], left).concat(placeIn([ratio, 0, 1 - ratio, 1], right));
}
function splitH(ratio, top, bottom) {
  return placeIn([0, 0, 1, ratio], top).concat(placeIn([0, ratio, 1, 1 - ratio], bottom));
}

const FULL = [[0, 0, 1, 1]];

// ── Centre + surround ─────────────────────────────────────────────────────────
//
// One big tile in the middle framed by a ring of smaller ones. The ring is four
// bands — above, below, left and right of the centre — each cut into equal
// slices. Two framings are offered: the corners belong either to the top and
// bottom bands (full-width strips, columns between them) or to the sides
// (full-height columns, strips between them). Which framing wins and how many
// slices each band gets is decided like the mosaic is: by how well the clips'
// shapes fit, so portrait clips gravitate to the sides and landscape ones to
// the strips. The centre is always region 0, which is what a pinned camera
// tile and the hero rules key on.

const centerCache = new Map(); // `${n}:${size}` → templates

function centerTemplates(n, size) {
  const s = Math.max(0.3, Math.min(0.8, +size || 0.5));
  const key = `${n}:${s}`;
  if (centerCache.has(key)) return centerCache.get(key);

  const out = [];
  const surround = n - 1;
  if (surround >= 4) {
    const m = (1 - s) / 2; // ring thickness on every side
    const centre = [m, m, s, s];
    const framings = [
      { top: [0, 0, 1, m], bottom: [0, 1 - m, 1, m], left: [0, m, m, s], right: [1 - m, m, m, s] },
      { top: [m, 0, s, m], bottom: [m, 1 - m, s, m], left: [0, 0, m, 1], right: [1 - m, 0, m, 1] },
    ];
    const max = CENTER_MAX_SLICES;
    for (const f of framings) {
      for (let t = 1; t <= max; t++) {
        for (let b = 1; b <= max; b++) {
          for (let l = 1; l <= max; l++) {
            const r = surround - t - b - l;
            if (r < 1 || r > max) continue;
            out.push([
              centre,
              ...placeIn(f.top, cols(t)),
              ...placeIn(f.bottom, cols(b)),
              ...placeIn(f.left, rows(l)),
              ...placeIn(f.right, rows(r)),
            ]);
          }
        }
      }
    }
  }
  centerCache.set(key, out);
  return out;
}

// ── Assemble candidate templates per tile-count ───────────────────────────────

const raw = { 1: [FULL], 2: [], 3: [], 4: [], 5: [], 6: [] };

raw[2] = [cols(2), rows(2)];

raw[3] = [cols(3), rows(3)];
for (const r of RS) {
  raw[3].push(splitV(r, FULL, rows(2)));   // 1 big left  + 2 stacked right
  raw[3].push(splitV(r, rows(2), FULL));   // 2 stacked left + 1 big right
  raw[3].push(splitH(r, FULL, cols(2)));   // 1 big top   + 2 side-by-side bottom
  raw[3].push(splitH(r, cols(2), FULL));   // 2 side-by-side top + 1 big bottom
}

raw[4] = [grid(2, 2), cols(4), rows(4)];
for (const r of RS) {
  raw[4].push(splitV(r, FULL, rows(3)));
  raw[4].push(splitV(r, rows(3), FULL));
  raw[4].push(splitH(r, FULL, cols(3)));
  raw[4].push(splitH(r, cols(3), FULL));
  raw[4].push(splitV(r, rows(2), rows(2))); // asymmetric 2x2
}

raw[5] = [];
for (const r of RS) {
  raw[5].push(splitV(r, FULL, grid(2, 2))); // 1 big left + 2x2 right
  raw[5].push(splitV(r, grid(2, 2), FULL));
  raw[5].push(splitH(r, FULL, grid(2, 2))); // 1 big top + 2x2 bottom
  raw[5].push(splitH(r, grid(2, 2), FULL));
}

raw[6] = [grid(3, 2), grid(2, 3)];
for (const r of RS) {
  raw[6].push(splitV(r, rows(2), grid(2, 2))); // 2 tall left + 2x2 right
  raw[6].push(splitV(r, grid(2, 2), rows(2)));
}

// ── Precompute template metadata (dedupe + col/row span) ──────────────────────

function templateDims(rects) {
  const xs = [...new Set(rects.flatMap((r) => [r[0], r[0] + r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r[1], r[1] + r[3]]))].sort((a, b) => a - b);
  let rowsMax = 1, colsMax = 1;
  for (let i = 0; i < xs.length - 1; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2;
    const c = rects.filter((r) => r[0] <= mx && mx <= r[0] + r[2]).length; // vertical stack at this column
    rowsMax = Math.max(rowsMax, c);
  }
  for (let i = 0; i < ys.length - 1; i++) {
    const my = (ys[i] + ys[i + 1]) / 2;
    const c = rects.filter((r) => r[1] <= my && my <= r[1] + r[3]).length; // horizontal run at this row
    colsMax = Math.max(colsMax, c);
  }
  return { cols: colsMax, rows: rowsMax };
}

function templateKey(rects) {
  return rects.map((r) => r.map((v) => Math.round(v * 1000)).join(',')).sort().join('|');
}

const TEMPLATES = {};
for (const n of Object.keys(raw)) {
  const seen = new Set();
  TEMPLATES[n] = [];
  for (const rects of raw[n]) {
    const k = templateKey(rects);
    if (seen.has(k)) continue;
    seen.add(k);
    const d = templateDims(rects);
    TEMPLATES[n].push({ rects, cols: d.cols, rows: d.rows });
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function getAspectRatio(item) {
  if (item && item.width && item.height && item.height !== 0) return item.width / item.height;
  if (item && item.aspectRatio) return item.aspectRatio;
  return 16 / 9;
}

// With object-fit: cover, the visible (non-cropped) fraction of a video equals
// min(AR)/max(AR) of the cell vs the media. Higher = less cropping.
function visibleFraction(mediaAR, cellAR) {
  return Math.min(mediaAR, cellAR) / Math.max(mediaAR, cellAR);
}

// Greedily pair similar aspect ratios (region widest↔video widest). Returns the
// per-region item assignment and the average visible fraction.
function assignByAspect(regions, items) {
  const regSorted = regions.map((r, i) => ({ i, ar: r.w / r.h })).sort((a, b) => a.ar - b.ar);
  const itemSorted = items.map((it, i) => ({ i, ar: getAspectRatio(it) })).sort((a, b) => a.ar - b.ar);
  const assignment = new Array(regions.length);
  let total = 0;
  for (let k = 0; k < regions.length; k++) {
    assignment[regSorted[k].i] = itemSorted[k].i;
    total += visibleFraction(itemSorted[k].ar, regSorted[k].ar);
  }
  return { assignment, score: regions.length ? total / regions.length : 0 };
}

// For the centre + surround layout the middle tile is the point, so it gets
// the clip that fits it best before the ring is paired up by rank as usual.
// Region 0 is the centre.
function assignCenterFirst(regions, items) {
  if (!regions.length || !items.length) return { assignment: [], score: 0 };
  const centreAR = regions[0].w / regions[0].h;
  let pick = 0, pickFit = -1;
  items.forEach((it, i) => {
    const fit = visibleFraction(getAspectRatio(it), centreAR);
    if (fit > pickFit) { pickFit = fit; pick = i; }
  });
  const restItems = items.map((it, i) => ({ it, i })).filter((x) => x.i !== pick);
  const ring = assignByAspect(regions.slice(1), restItems.map((x) => x.it));
  const assignment = [pick, ...ring.assignment.map((k) => restItems[k].i)];
  const score = (pickFit + ring.score * (regions.length - 1)) / regions.length;
  return { assignment, score };
}

/**
 * Choose the best mosaic layout for a set of candidate items.
 *
 * items   — ordered candidates; the first `minTiles` are committed (playing).
 * opts.minTiles / maxTiles — tile-count bounds.
 * opts.maxCols / maxRows   — cap how finely the canvas may be subdivided.
 * opts.minCols / minRows   — floor on the subdivision (bias toward more tiles).
 * opts.forceGrid {cols,rows} — skip best-fit entirely and use that exact grid.
 * opts.center {size,tiles}  — one centre tile (size = fraction of the screen)
 *                             ringed by up to `tiles` more; needs 5+ clips.
 *
 * Returns { count, rects:[[x,y,w,h]px], assignment:[itemIndex per region], score }.
 */
function chooseLayout(items, screenW, screenH, opts = {}) {
  const maxCols = Math.max(1, opts.maxCols || 4);
  const maxRows = Math.max(1, opts.maxRows || 4);
  const minCols = Math.max(1, Math.min(opts.minCols || 1, maxCols));
  const minRows = Math.max(1, Math.min(opts.minRows || 1, maxRows));
  const minTiles = Math.max(1, opts.minTiles || 1);
  const hardMax = Math.min(items.length, opts.maxTiles || MAX_TILES, MAX_TILES);

  // Forced grid: the user picked the shape, so there is nothing to optimize —
  // just fill as much of it as we have videos for.
  if (opts.forceGrid) {
    const g = opts.forceGrid;
    const gc = Math.max(1, g.cols || 1);
    const gr = Math.max(1, g.rows || 1);
    const cap = Math.max(1, Math.min(items.length, opts.maxTiles || Infinity));

    // The hero shape is all-or-nothing: with too few clips to fill it we would
    // leave holes in the grid, so fall back to the plain (gap-free) layout.
    let unit = null;
    if (g.hero) {
      const h = heroGrid(gc, gr, g.heroSpan || 2, g.heroPosition);
      if (h && cap >= h.length) unit = h;
    }
    if (!unit) unit = fixedGrid(gc, gr, Math.min(cap, gc * gr));

    const n = unit.length;
    const rects = unit.map(([x, y, w, h]) => ({
      x: x * screenW, y: y * screenH, w: w * screenW, h: h * screenH,
    }));
    const { assignment, score } = assignByAspect(rects, items.slice(0, n));
    return { score, count: n, assignment, rects: rects.map((r) => [r.x, r.y, r.w, r.h]) };
  }

  // Centre + surround: the ring needs at least one tile per band, so with too
  // few clips for that it falls through to the best-fit mosaic below.
  if (opts.center) {
    const tiles = Math.max(4, Math.min(CENTER_MAX_SURROUND, opts.center.tiles || 8));
    const n = Math.min(items.length, 1 + tiles, opts.maxTiles || Infinity);
    if (n >= CENTER_MIN_TILES) {
      const subset = items.slice(0, n);
      let best = null;
      for (const rects of centerTemplates(n, opts.center.size)) {
        const regions = rects.map(([x, y, w, h]) => ({
          x: x * screenW, y: y * screenH, w: w * screenW, h: h * screenH,
        }));
        const { assignment, score } = assignCenterFirst(regions, subset);
        if (!best || score > best.score) {
          best = { score, count: n, assignment, rects: regions.map((r) => [r.x, r.y, r.w, r.h]) };
        }
      }
      if (best) return best;
    }
  }

  let best = null;

  for (let n = Math.min(minTiles, hardMax); n <= hardMax; n++) {
    const templates = TEMPLATES[n];
    if (!templates) continue;
    const subset = items.slice(0, n);

    for (const t of templates) {
      // The col/row bounds are a strong preference, not a hard limit: a forced
      // tile count (e.g. a manual insert) can still pick an out-of-bounds
      // template rather than fail to lay out at all.
      const capOk = t.cols <= maxCols && t.rows <= maxRows
        && t.cols >= minCols && t.rows >= minRows;
      const regions = t.rects.map(([x, y, w, h]) => ({
        x: x * screenW, y: y * screenH, w: w * screenW, h: h * screenH,
      }));
      const { assignment, score: fit } = assignByAspect(regions, subset);
      let score = fit * (1 - (n - 1) * TILE_PENALTY);
      if (!capOk) score *= 0.001;
      if (!best || score > best.score) {
        best = {
          score,
          count: n,
          assignment,
          rects: regions.map((r) => [r.x, r.y, r.w, r.h]),
        };
      }
    }
  }

  if (!best) {
    best = { score: 0, count: 1, assignment: [0], rects: [[0, 0, screenW, screenH]] };
  }
  return best;
}

module.exports = {
  chooseLayout, visibleFraction, getAspectRatio, fixedGrid, heroGrid, centerTemplates, TEMPLATES,
  CENTER_MIN_TILES, CENTER_MAX_SURROUND,
};
