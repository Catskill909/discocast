# DiscoCast — Handoff

> Start here in a new chat. This is the map of the whole DiscoCast system: both
> repos, how they connect, how they ship, where the docs are, and what's open.
> Keep **Current state** and **Open items** up to date. Put deep detail in the
> linked truth docs, not here.
>
> Last updated: **2026-10-11**

## Current state

- **Latest app build:** **Beta Oct 11, 2026**. The macOS `.dmg` is signed,
  notarized, tested by the user, and pushed to `promo/`. The Windows `.exe` for
  this build is **being added** (see Open items).
- **Site:** has a What's New section, and its popup now shows once per release
  (see [README → What's New + popup](README.md#whats-new--popup)).
- **Both repos are pushed to `main`.** Production updates only when the user
  deploys in Coolify.

## The two repos

DiscoCast is **two sibling repos** in `~/Desktop/`:

| Repo | What it is | Ships as |
| --- | --- | --- |
| **`winamp-screen/`** | The actual app: **DiscoCast Visualizer**. Butterchurn/MilkDrop WebGL visualizer + Preset Studio (`editor.html`) + Timeline (`timeline.html`) + output window. Vanilla JS + Vite 8, wrapped in **Tauri 1** for desktop. | Web build (nginx Docker), macOS `.dmg` (signed + notarized), Windows `.exe` (GitHub Action) |
| **`discocast/`** (this repo) | The **promo / download site** + community preset sharing. Small Express server. | Docker container on Coolify → **https://discocast.supersoul.top** |

`discocast` never touches the app code. It only hosts the installers that
`winamp-screen` builds.

## How the user works

- **Always on `main`.** Never branch. Commit + push, then the user deploys in
  Coolify.
- **In `winamp-screen`, plan first:** explain what happens now, what should
  happen, and what will change, then wait for "go ahead"
  (`winamp-screen/CLAUDE.md`).
- **One truth doc per topic.** Update the existing `*-dev.md`; don't start a new
  one.
- **Verify in the real desktop app,** not just the browser. WKWebView behaves
  differently from Chromium. See *Testing the desktop app* below.

## discocast (this repo) at a glance

- `server.js`: the whole backend. Serves `promo/`, counts page views and
  per-OS installer downloads (human-only, bot UAs filtered), geo tallies
  (offline `geoip-lite`, no raw IPs stored), preset submissions, the admin API,
  and the public approved-presets API.
- Pages in `promo/`: `index.html` (promo + What's New + popup), `submit.html`
  (`/submit` wizard), `admin.html` (`/admin`, key-gated), `presets.html`
  (`/presets` public gallery).
- Data: `DATA_DIR` (`/data` volume in prod). `counts.json` +
  `submissions/<id>/{meta.json,preset.json,image.webp,thumb.webp}`.
- Auth: env `STATS_KEY` gates `/admin`, `/api/*` admin routes, `/stats.json`.
  If it's unset, those are **open**. `:id` params must match `^[a-f0-9]{12}$`.
- Deps: express, multer (memory storage, 80 MB preset cap), sharp (preview
  resize to webp), geoip-lite.

Full detail: [README.md](README.md) (layout, deploy, popup, release
checklist) and `winamp-screen/discocast-admin-dev.md` (truth doc for admin +
preset sharing).

## Releasing a new app build

The step-by-step checklist is in
[README → Release checklist](README.md#release-checklist). In short:
`build-and-sign.sh` (mac) → Windows GitHub Action → add a What's New release
block → push → deploy. The download buttons and counters only know the **two
exact installer filenames** (`MAC_FILE` / `WIN_FILE` in `server.js`).

The build script **kills every vite / `tauri dev` process** when it starts. A
dev window left open will lose its server and freeze. That's expected, not a
bug.

## winamp-screen (the app) at a glance

- `src/main.js` + `visualizer.js`: player. `src/editor/` is the **Preset Studio**
  (the big file is `src/editor/inspector.js`). `src/timeline/` is the Timeline.
  `src/output/` is the second-display output.
- `src/customPresets.js` + `presetStore.js`: custom presets (IndexedDB on web,
  native files on desktop), bulk export/import, and stored media
  (`storeImage` / `getImage`).
- **Video preloading** (`VisualizerEngine.prepareMedia` in `visualizer.js`):
  each preset's videos are prepared before the switch, the next preset is
  preloaded ahead of time (player and timeline), and old videos are freed. See
  `video-dev.md` §28.
- `src/videoTranscoder.js`: **FFmpeg.wasm**, self-hosted (`@ffmpeg/core@0.12.9`
  is bundled, so it works offline). Handles the 720p downscale and `stripAudio`.
  Keep `@ffmpeg/core` matched to `@ffmpeg/ffmpeg`'s `CORE_VERSION`.
- `src-tauri/`: Tauri 1 shell. Stored media is read via the **asset protocol**
  (`get_blob_path` + `convertFileSrc`; `$APPDATA/images/*` is in `assetScope`).
  Sidecars in `src-tauri/binaries/`: a native `ffmpeg` and `ndi-send`.
- **CSPs live in two places:** `src-tauri/tauri.conf.json` (desktop) and
  `nginx.conf` (web). Anything loaded from another origin must be allowed in
  both.

### Testing the desktop app

- `npm run tauri-dev` runs the real WKWebView app. Its web-view console does
  **not** reach the terminal. To measure inside it, use a temporary Rust
  `dev_log` command plus a dev-only harness (env-flagged, never committed).
  Clean up any test presets afterwards: they're written into the real user
  library at `~/Library/Application Support/app.discocast.visualizer/`.
- Playwright (in `winamp-screen/node_modules`) only covers the web build. Use
  `headless: false` for real-GPU timings; headless uses software GL and its
  timings mislead.
- **WKWebView gotcha:** the first `drawImage(video)` blocks for up to 1 s unless
  frames are already flowing. See `video-dev.md` §28.

## Doc catalogue (winamp-screen)

Truth docs, by topic. If a doc carries an archive banner, follow the pointer.

| Topic | Doc |
| --- | --- |
| Promo site admin + preset sharing | `discocast-admin-dev.md` |
| Promo site release notes / popup | `discocast/README.md` (this repo) |
| Preset upload validation / safety | `discocast-preset-validation-dev.md` |
| Promo split (history) | `promo-page-split.md` |
| Preset Studio (editor) | `custom-preset-editor.md`, `docs/preset-editor/*` |
| Video layers, transcoding, **preloading** | `video-dev.md` (§5.2 FFmpeg offline, §28 preloading), `video-tiling-dev.md`, `live-video-dev.md`, `video-cutout-edge-noise-dev.md` |
| Transparent video | `transparent-dev.md` |
| Output / multi-monitor / NDI | **`output-dev.md`** (app-/native-/visualizer-output are archive) |
| Timeline | `timeline-editor.md` (`timeline-editor-archive.md` is archive) |
| MilkDrop engine / import / packs | `milkdrop-dev.md`, `milkdrop-import-dev.md`, `milkdrop-pack-import.md`, `milkdrop-control-dev.md`, `milkdrop-tools-dev.md` |
| Audio | `meyda-audio-dev.md`, `noise-gate-dev.md`, `live-input-dev.md`, `docs/audio-triggering.md`, `docs/spectral-flux-dev.md` |
| Layers & effects | `animation-dev.md`, `text-layer-dev.md`, `shape-overlay-dev.md`, `image-texture-dev.md`, `apng-dev.md`, `solarize-dev.md`, `color-pallette-dev.md`, `3d-dev.md` |
| Storage | `storage-audit-dev.md` |
| macOS build / Windows build | `macos-app-generate.md` + `build-and-sign.sh`, `windows-dev.md` |
| MIDI | `midi-dev.md` |
| Bugs (open/closed write-ups) | `docs/bugs/*`, `macos-import-bug.md`, `preset-save-bug.md`, `user-guide-bug.md`, `width-height-video-bug.md` |
| Older handoffs | `docs/handoff-animation-may2026.md`, `docs/handoff-milkdrop-research-may2026.md` |

## Open items

1. **Windows `.exe` for Beta Oct 11, 2026.** The user runs the GitHub Action and
   drops the installer into `promo/` as
   `DiscoCast Visualizer_0.1.0_x64-setup.exe`. Then commit + push and deploy.
   **Don't deploy before the `.exe` is in**, or Windows users get the June
   build under the new release notes.
2. **Possible follow-up (not requested yet):** adding a video in the Preset
   Studio (`_addVideoLayer`) likely hits the same one-time WKWebView 1-second
   first-draw freeze. The same warm-up as `_prepareVideo` would fix it.
3. **Won't fix (decided 2026-10-11):** `trust proxy` is `true`, so a client can
   spoof `X-Forwarded-For`. That lets someone dodge the 5-per-hour submit limit
   and skew the geo stats. Low impact, since every submission needs admin
   approval. If it ever matters, the fix is
   `app.set('trust proxy', 'loopback, linklocal, uniquelocal')`. Prod is direct
   DNS → Coolify Traefik, with no Cloudflare in front.

## Done 2026-10-11 (audit session)

- **Offline video import:** FFmpeg core self-hosted. It used to come from
  unpkg, so imports failed offline, and the web build's CSP always blocked it.
  A failed load now retries instead of sticking until reload. `video-dev.md`
  §5.2.
- **Video preset switching:**
  - Fixed a ~0.5–1 s freeze when switching to a preset with video.
  - Videos load from disk via the asset protocol (was base64 over IPC).
  - Videos are prepared before the switch and preloaded ahead (lookahead).
  - Old videos are freed instead of leaking.
  - The WKWebView first-draw warm-up removes a separate 1 s stall.

  Measured in the real desktop app. `video-dev.md` §28.
- **Bulk preset import:** a video that can't be stripped now fails that preset
  cleanly instead of being stored with its audio.
- **discocast:** blocked a path traversal (`DELETE /api/submissions/%2E%2E`
  wiped the whole data volume).
- **Repo cleanup:** stray test files and unused versioned DMGs removed; root
  `logo.png` deleted.
- **Site:** What's New section + once-per-release popup; footer links wrap on
  phones.
