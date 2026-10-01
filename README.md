# GoonTiles

A local multi-monitor **video wall** with a built-in **hypno effects** toolkit. It
tiles local videos across every screen, optimizing how many play at once based on
their aspect ratios, and layers on optional Poppers Training, music-synced
visuals, hypnosis patterns, text commands, and a bate goal.

Built with Electron (no internet required at runtime — everything is local).

---

## What it does

- **Tiled playback** — point it at folders of videos; it fills each monitor with a
  mosaic that adapts to the clips' shapes (e.g. 3 portraits side-by-side, or one
  landscape full-screen). When a video ends, the layout re-flows smoothly to the
  next ones. Crop-to-fill, no black bars.
- **Layout modes** — *best fit* (the adaptive mosaic, now with a **minimum** as
  well as a maximum column / row count), a **fixed grid** you set yourself
  (e.g. 4 × 1 for a wall of vertical clips), which never re-flows, or
  **centre + surround**: one big tile in the middle of the screen framed by a
  ring of smaller ones. You set how much of the screen the centre takes and how
  many tiles ring it; the ring itself is shaped to the clips, so portrait clips
  become full-height columns down the sides and landscape ones become strips
  across the top and bottom. The centre gets the clip that fits it best, and
  finished clips swap in place so it is never disturbed. A grid can have a
  **hero cell** — one oversized tile with the rest filling around it.
- **Solo, drag and drift** — double-click a tile to blow it up over the whole
  window (again, or `Esc`, to drop back); drag one tile onto another to trade
  their positions; and an optional **Ken Burns drift** slowly zooms and pans,
  with adjustable strength, speed and **rotation**, a focal point (random,
  centre, or wherever you reframed the tile to) and a **scope**: each tile
  drifting on its own, or the **whole wall** moving together as one picture. It
  can also **sync to the beat** — the sweep runs a set number of beats and every
  tile locks to the shared tempo clock.
- **Clip shape filter** — play **vertical-only** or **horizontal-only** clips.
  Pairs with a fixed grid for an all-portrait wall.
- **Per-tile controls** (hover a tile): **Reframe** (drag to reposition the crop),
  **Loop**, **Skip**, **★ Prefer** / **⊘ Avoid** the clip's folder, **Remove**, a
  **seek bar**, and a **per-tile volume** slider. Each tile shows the subfolder
  it's playing from. Small tiles get icon-only controls; the Layout section can
  make that always or never.
- **One folder list** — every folder lives in a single list where its row says
  what it does: serve **clips**, serve **stills**, or both; be **preferred** or
  **avoided**; and be tied to a **screen**. A folder always serves clips or
  stills (the last one stays locked on), preferring and avoiding are mutually
  exclusive, and rows only leave the list when you remove them.
- **Folder priorities** — ★ on a tile pulls that folder's clips to the **front of
  the queue** so they play next; ⊘ sends them to the **very back**. Both are
  plain toggles (press again to clear), the wall tells you how many clips moved,
  and avoiding a folder also swaps anything from it that is on screen right now.
  A priority set on a subfolder appears in the folder list under the folder it
  came from.
- **Queue shaping** — a **repeat cooldown** keeps a clip off the wall for a set
  time after it plays (relaxed only when there is nothing else left), a clip
  never appears in two tiles at once, and **deal folders in turn** rotates
  through your folders so neighbouring tiles come from different ones.
- **Skip replaces in place** — skipping swaps the next clip into the same tile
  instead of collapsing it; a fixed grid does this for finished clips too, and
  best-fit mode can opt in.
- **Audio** — master volume (↑ / ↓), per-tile volume, **auto-leveling** that pulls
  loud and quiet clips toward a common loudness (with a target-loudness control),
  a **limiter** and soft-clip ceiling so nothing ever clips, and optional
  **position panning** that pans each tile to where it sits on the wall.
- **Insert / remove tiles** on the fly via the left/right edge buttons, which
  can be switched off for a clean wall.
- **Display modes** — one window per screen, a custom window count, or one window
  **spanned across all monitors**; optionally black out unused screens.
- **Screen zones** — tie a folder to one screen from its row in the folder list,
  so one monitor plays one thing while another plays something else. A screen
  with no folders of its own draws from the whole library, and zoned screens
  keep their own place in the queue.
- **Live camera tile** — hand one tile to a webcam, optionally pinned to the hero
  cell. It never advances, and it is left out of the audio path.
- **Camera recording** — save the live camera tile as an **MP4** (H.264 + AAC)
  file. Recording starts with the wall and closes safely when you quit. Files
  land in `Videos\GoonTiles` unless you pick another folder.
- **Filters** — shuffle, skip the first N seconds of each clip, a min/max clip
  **length** filter, and an optional **quality filter** that skips anything below
  a resolution floor (measured on the shorter side, so portrait footage is judged
  fairly).
- **Still images** — optionally mix images in among the clips, taken from the
  folders whose row is marked for stills. Each still holds its tile for a set
  time, and Loop pins it in place indefinitely.
- **Poppers Training** — periodic guided inhale / hold / exhale rounds with an
  animated orb, ring/phase progress, optional tones, and a countdown using a
  selected poppers bottle. It can lock its pace to the music tempo.
- **Tempo + rhythm** — load a music track and it auto-detects BPM (tap-tempo to
  override); a small rhythm ball bounces on the beat. The track **picks up where
  it left off** last time, so a long mix does not restart from the top every
  session.
- **Hypnosis patterns** — grayscale pattern video loops blended over the wall
  (white → transparent), from bundled defaults or your own folder; auto-cycle.
- **Text overlay** — big affirmations stretched to fill the screen, with flash
  styles synced to the beat; lines from a file, or **affirmation audio** clips
  whose filenames are the spoken text (they duck the other audio).
- **Spoken commands** — add a voice track under the text overlay and flash its
  timed words as they are spoken. It can play at session start or lead into
  Poppers Training while the other audio ducks underneath it.
- **Bate goal** — bate toward a target time or your personal best, with an
  optional 10-second countdown and a **countdown sound** that plays so it ends
  exactly as the target is reached.
- **Progressive intensity** — open on a couple of tiles with the pattern overlay
  barely there, and ramp up to the full settings over the first stretch of the
  session.
- **Session history** — every session over 30 seconds is logged and graphed in
  the control window, with totals, average and longest.
- **Presets** — switch the whole setup in one step. Eight are built in —
  *Vertical wall*, *Single screen*, *Mosaic*, *Hero focus*, *Centre stage*,
  *Ambient drift*, *Beat-synced wall* and *Deep trance* — and saving your own
  captures every setting except the folders. Delete any you don't want; they
  won't come back.
- **Folder sets** — the folder list, with each folder's roles, priorities and
  screen zones, saved under a name of its own. Presets and folder sets are
  independent, so you can switch libraries without touching the layout and
  vice versa. Presets saved before folder sets existed have their folders moved
  into a set of the same name the first time the new version runs.

---

## Running it (development)

Requires [Node.js](https://nodejs.org/) (which includes npm).

```sh
npm install        # first time only
npm start          # launches the app
```

To skip the control window and start straight on a folder:

```sh
node launch.js "C:\path\to\videos"
```

> **Why `launch.js` instead of `electron .`?** Some shells (notably VS Code's
> integrated terminal) set `ELECTRON_RUN_AS_NODE=1`, which makes Electron boot as
> plain Node and crash instantly (`Cannot read properties of undefined (reading
> 'whenReady')`). `launch.js` strips that variable before spawning Electron.

The app writes a debug log to `debug.log` (project folder in development, or the
GoonTiles user-data folder when packaged).

---

## Building a standalone .exe

```sh
npm run build-exe
```

This bundles the app + Electron runtime into a portable folder:

```
dist\GoonTiles-win32-x64\GoonTiles.exe
```

Double-click that `.exe` — no Node or terminal needed. You can copy the whole
folder anywhere (or to another Windows PC) and run it. Re-run `npm run build-exe`
after code changes.

> There is also `npm run dist` (electron-builder, makes a single-file installer),
> but it needs symlink privileges on Windows (Developer Mode or admin) to unpack
> its code-signing helper. `build-exe` (@electron/packager) has no such
> requirement and is the recommended path.

---

## Keyboard shortcuts (during playback)

| Key | Action |
|-----|--------|
| `N` / `→` | Skip to the next videos (re-tile) |
| `Space` | Pause / resume all |
| `M` | Mute / unmute |
| `↑` / `↓` | Master volume up / down |
| `R` | Reshuffle |
| `C` | Open the settings (control) window |
| `V` | Toggle the rhythm indicator |
| `T` | Tap tempo |
| `H` | Toggle the hypnosis pattern |
| `P` | Cycle the hypnosis pattern |
| `X` | Toggle the text overlay |
| `Esc` | Leave a solo'd tile, otherwise quit |
| `Q` | Quit |

Per-tile gestures: **double-click** a tile to solo it, and **drag** a tile onto
another to swap their positions.

Most features are configured in the **control window** shown at launch. Its
sections start collapsed, each showing a one-line summary of its own settings,
and the icon strip at the top jumps to any of them; a section's icon lights amber
when that subsystem is armed. **Detailed** shows every explanation, **condensed**
drops them and flows the controls into columns.

Settings persist between sessions in `config.json` in the app's user-data folder,
and the three previous versions are kept beside it as `config.json.1` to `.3` —
if something ever clears a setting you care about, rename one of those back.

---

## Project layout

| Path | Purpose |
|------|---------|
| `main.js` | Electron main process — windows, scheduling, config, IPC |
| `launch.js` | Dev launcher that strips `ELECTRON_RUN_AS_NODE` |
| `renderer.html` / `renderer.js` | A player window (tiles + overlays) |
| `controls.html` / `controls.js` | The settings window |
| `prober.*` | Hidden window that reads video dimensions/durations |
| `audio.js` | Hidden window: music playback, BPM detection, affirmation audio |
| `layout.js` | The mosaic layout optimizer |
| `*-preload.js` | `contextBridge` APIs between main and each window |
| `patterns/` | Bundled grayscale hypnosis-pattern video loops |
| `fonts/` | Bundled fonts (Monument Extended, Bitcount) |
| `demo-media/` | Sample solid-color clips for trying the wall |
| `build/icon.ico` | App icon |

---

## Notes

- Video formats are limited to what Chromium can play (MP4/WebM/MOV/M4V/OGV).
- For the hypnosis patterns, source clips should be **grayscale** — black is shown
  (darkening the video) and white becomes transparent (multiply blend).
- Affirmation audio clips are matched to text by **filename**, e.g.
  `you are calm.mp3` shows "YOU ARE CALM" and plays that clip.
- Recordings are fragmented MP4 (H.264 + AAC) written a chunk at a time, so a
  crash still leaves a playable file behind. On a machine with no H.264 encoder
  the app falls back to WebM (VP8 + Opus); those carry no total duration, so
  players show them as live streams until they have scanned through, and
  re-encoding one (ffmpeg, HandBrake) gives you a normal seekable file.
- The music position is kept in `music-position.json` next to `config.json`;
  delete it to start the track from the top again.
- Spoken-command timing comes from the `.json` the hypnosis studio's bake script
  writes beside each WAV: a `lines` list of `{ "t", "end", "text" }` in seconds.
  A voice file without one still plays; its words just don't flash.
