# DiscoCast — Handoff

> Start here in a new chat. This is the map of the whole DiscoCast system: both
> repos, how they connect, how they ship, where the docs are, and what's open.
> Keep **Open issues** current; keep deep detail in the linked truth docs.
>
> Last audit: **2026-10-11**

## The two repos

DiscoCast is **two sibling repos** in `~/Desktop/`:

| Repo | What it is | Ships as |
| --- | --- | --- |
| **`winamp-screen/`** | The actual app: **DiscoCast Visualizer**. Butterchurn/MilkDrop WebGL visualizer + Preset Studio (`editor.html`) + Timeline (`timeline.html`) + output window. Vanilla JS + Vite 8, wrapped in **Tauri 1** for desktop. | Web build (nginx Docker), macOS `.dmg` (signed + notarized), Windows `.exe` (GitHub Action) |
| **`discocast/`** (this repo) | The **promo / download site** + community preset sharing. Small Express server. | Docker container on Coolify → **https://discocast.supersoul.top** |

`discocast` never touches the app code. It only hosts the installers that
`winamp-screen` builds.

## discocast (this repo) at a glance

- `server.js`: the whole backend. Serves `promo/`, counts page views and
  per-OS installer downloads (human-only, bot UAs filtered), geo tallies
  (offline `geoip-lite`, no raw IPs stored), preset submissions, the admin API,
  and the public approved-presets API.
- Pages in `promo/`: `index.html` (promo), `submit.html` (`/submit` wizard),
  `admin.html` (`/admin`, key-gated), `presets.html` (`/presets` public gallery).
- Data: `DATA_DIR` (`/data` volume in prod). `counts.json` +
  `submissions/<id>/{meta.json,preset.json,image.webp,thumb.webp}`.
- Auth: env `STATS_KEY` gates `/admin`, `/api/*` admin routes, `/stats.json`.
  If it's unset, those are **open**.
- Deps: express, multer (memory storage, 80 MB preset cap), sharp (preview
  resize to webp), geoip-lite.

Full detail: [README.md](README.md) and
`winamp-screen/discocast-admin-dev.md` (truth doc for admin + preset sharing).

### Deploy flow

Local → commit on **`main`** (never branch) → push → user clicks deploy in
Coolify. Image is `node:24-alpine`, port 3000, volume at `/data`, healthcheck
`/healthz`.

### Releasing a new app build

1. macOS: `winamp-screen/build-and-sign.sh` builds, signs, notarizes, and writes
   `DiscoCast-Visualizer.dmg`, `version.json`, and the version span in
   `index.html` into `../discocast/promo/`.
2. Windows: download the `build-windows.yml` artifact from GitHub Actions and
   save it as `promo/DiscoCast Visualizer_0.1.0_x64-setup.exe`.
3. Commit + push this repo, then deploy in Coolify.

The download buttons and the counters only know those **two exact filenames**
(`MAC_FILE` / `WIN_FILE` in `server.js`). Versioned copies like
`DiscoCast Visualizer-1.0.*.dmg` are gitignored here.

## winamp-screen (the app) at a glance

- `src/main.js` + `visualizer.js`: player. `src/editor/` is the **Preset Studio**
  (the big file is `src/editor/inspector.js`). `src/timeline/` is the Timeline.
  `src/output/` is the second-display output.
- `src/customPresets.js` + `presetStore.js`: custom presets in IndexedDB,
  bulk export/import.
- `src/videoTranscoder.js`: **FFmpeg.wasm** (`@ffmpeg/ffmpeg` 0.12). Handles
  the 720p downscale and `stripAudio`.
- `src-tauri/`: Tauri 1 shell. Sidecars in `src-tauri/binaries/`: a native
  `ffmpeg` (used for transparent WebM → stacked-alpha on macOS) and `ndi-send`.
- **CSPs live in two places:** `src-tauri/tauri.conf.json` (desktop) and
  `nginx.conf` (web). Anything loaded from a third-party origin must be allowed
  in both.
- `winamp-screen/CLAUDE.md` has the rules for that repo: plan first and wait
  for a "go ahead" before coding, and keep **one truth doc per topic** (never
  start a new `*-dev.md` when one exists).

## Doc catalogue (winamp-screen)

Truth docs, by topic. If a doc carries an archive banner, follow the pointer.

| Topic | Doc |
| --- | --- |
| Promo site admin + preset sharing | `discocast-admin-dev.md` |
| Preset upload validation / safety | `discocast-preset-validation-dev.md` |
| Promo split (history) | `promo-page-split.md` |
| Preset Studio (editor) | `custom-preset-editor.md`, `docs/preset-editor/*` |
| Video layers + transcoding | `video-dev.md`, `video-tiling-dev.md`, `live-video-dev.md`, `video-cutout-edge-noise-dev.md` |
| Transparent video | `transparent-dev.md` |
| Output / multi-monitor / NDI | **`output-dev.md`** (app-/native-/visualizer-output are archive) |
| Timeline | `timeline-editor.md` (`timeline-editor-archive.md` is archive) |
| MilkDrop engine / import / packs | `milkdrop-dev.md`, `milkdrop-import-dev.md`, `milkdrop-pack-import.md`, `milkdrop-control-dev.md`, `milkdrop-tools-dev.md` |
| Audio | `meyda-audio-dev.md`, `noise-gate-dev.md`, `live-input-dev.md`, `docs/audio-triggering.md`, `docs/spectral-flux-dev.md` |
| Layers & effects | `animation-dev.md`, `text-layer-dev.md`, `shape-overlay-dev.md`, `image-texture-dev.md`, `apng-dev.md`, `solarize-dev.md`, `color-pallette-dev.md`, `3d-dev.md` |
| Storage | `storage-audit-dev.md` |
| macOS build / Windows build | `macos-app-generate.md`, `windows-dev.md` |
| MIDI | `midi-dev.md` |
| Bugs (open/closed write-ups) | `docs/bugs/*`, `macos-import-bug.md`, `preset-save-bug.md`, `user-guide-bug.md`, `width-height-video-bug.md` |
| Older handoffs | `docs/handoff-animation-may2026.md`, `docs/handoff-milkdrop-research-may2026.md` |

## Open issues

### 1. ✅ FIXED 2026-10-11: video import failed offline ("Could not strip audio from video")

> Fixed in `winamp-screen` by self-hosting `@ffmpeg/core@0.12.9`
> (`load({ coreURL, wasmURL })`) and no longer caching a failed load.
> Verified offline and under the prod CSP. It ships with the **next app build**
> (macOS `.dmg` / Windows `.exe` / web deploy). Details are in
> `winamp-screen/video-dev.md` §5.2. The write-up below is kept for history.

**Symptom:** importing a video into the Preset Studio fails with *Could not
strip audio from video*. It later works again with no changes.

**Cause:** every video import goes through `stripAudio` (or `transcodeTo720p`
for videos over 720p) in `src/videoTranscoder.js`. Both call `ffmpeg.load()`
with no `coreURL`, so `@ffmpeg/ffmpeg` fetches its ~30 MB core from
**`https://unpkg.com/@ffmpeg/core@0.12.9/...`** at runtime. So:

- **No internet → video import is impossible.** `_addVideoLayer` in
  `src/editor/inspector.js` aborts on the strip error.
- **A failed load sticks for the life of the page.** `getFFmpeg()` caches the
  rejected `loadPromise` and leaves `isLoading = true`, so every retry fails
  until the page reloads. Going player → editor reloads the page, which is why
  it "fixed itself" once the connection was back.
- **The web build is always broken.** The nginx CSP (`script-src 'self'`) blocks
  the unpkg import. This was reproduced on 2026-10-11 with the production
  worker bundle: it works with no CSP and fails with the nginx CSP
  (`Failed to fetch dynamically imported module: https://unpkg.com/...`).
- **Bulk preset import** (`customPresets.js`) swallows the same error and
  stores the video *with* audio. That breaks the "no stored video has audio"
  invariant.

**Proposed fix:** self-host the ffmpeg core (add `@ffmpeg/core`, serve
`ffmpeg-core.js` + `.wasm` from the app's own origin, pass
`coreURL`/`wasmURL` to `load()`). Also clear the cached failure in
`getFFmpeg()` so a retry can succeed. This works offline in both builds and
needs no CSP change for third parties. Not started yet; per
`winamp-screen/CLAUDE.md` it needs the user's go-ahead first.

### 2. Housekeeping

- Root `logo.png` is untracked and differs from `promo/logo.png`. Decide
  whether to keep it.
- Bulk preset import (`customPresets.js`) still stores a video *with* audio if
  the strip fails for some other reason (it only warns). That's rare now that
  FFmpeg loads locally, but it's still a gap in the "no audio" rule.
