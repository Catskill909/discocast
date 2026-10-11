# DiscoCast — Handoff

> Start here in a new chat. This is the map of the whole DiscoCast system: both
> repos, how they connect, how they ship, where the docs are, and what's open.
> Keep **Current state** and **Open items** up to date. Put deep detail in the
> linked truth docs, not here.
>
> Last updated: **2026-10-11** (includes a full doc audit)

## Read this first: how not to miss things

1. **This file** gives the system map, current state, and open items.
2. **`winamp-screen/README.md` → Platform support** shows what works on web vs the **macOS DMG** vs Windows.
   **The DMG is the product.** Many browser features silently do nothing in the Mac app.
3. **`winamp-screen/README.md` → Developer Documentation Index** lists *every* doc with its status
   (complete as of 2026-10-11). Find the topic's **truth doc** there.
4. **Before working on a topic, read its truth doc's status block** (e.g. `output-dev.md` Phase Board,
   `animation-dev.md` dashboard). Don't rely on memory or this file for topic detail.
5. `winamp-screen/CLAUDE.md` has the house rules (plan first, one truth doc per topic, desktop-first).

## Current state

- **Latest app build:** **Beta Oct 11, 2026**. Both installers are in `promo/`
  and pushed: the macOS `.dmg` (signed, notarized, user-tested) and the
  Windows `.exe` (GitHub Action).
- **Site:** has a What's New section, and its popup now shows once per release
  (see [README → What's New + popup](README.md#whats-new--popup)).
- **Projector / output on macOS (audited 2026-10-11):** the DMG can only **fullscreen the whole app** on a
  display. Every output window (operator screen + clean projector, Composed Program) works **only in the
  browser**. In the Mac app those buttons silently do nothing (`window.open` is unsupported in Tauri 1). NDI is
  disabled in builds. See `output-dev.md` 🚨 block. This is the top open product gap.
- **Both repos are pushed to `main`.** Production updates only when the user
  deploys in Coolify.

## The two repos

DiscoCast is **two sibling repos** in `~/Desktop/`:

| Repo | What it is | Ships as |
| --- | --- | --- |
| **`winamp-screen/`** (GitHub: `Catskill909/visualizer`, public) | The actual app: **DiscoCast Visualizer**. Butterchurn/MilkDrop WebGL visualizer + Preset Studio (`editor.html`) + Timeline (`timeline.html`) + output window. Vanilla JS + Vite 8, wrapped in **Tauri 1** for desktop. | Web build (nginx Docker), macOS `.dmg` (signed + notarized), Windows `.exe` (GitHub Action) |
| **`discocast/`** (this repo; GitHub: `Catskill909/discocast`) | The **promo / download site** + community preset sharing. Small Express server. | Docker container on Coolify → **https://discocast.supersoul.top** |

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
[README → Release checklist](README.md#release-checklist). In short: push
`winamp-screen`, then build **macOS and Windows in parallel**
(`./build-and-sign.sh` locally + `gh workflow run "Build Windows Installer" -R
Catskill909/visualizer`). Download the `.exe`, add a What's New release block,
push both installers, then deploy. The download buttons and counters only know the **two
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

## Doc catalogue

**The complete, maintained index is `winamp-screen/README.md` → Developer Documentation Index** (every `.md`,
with status). It's not duplicated here, so the two can't drift apart. Quick pointers to the most-used truth docs:
`output-dev.md` (output/projector), `video-dev.md` (video), `timeline-editor.md`, `custom-preset-editor.md`
(Preset Studio), `animation-dev.md`, `milkdrop-tools-dev.md`, `apng-dev.md` (macOS-app video lessons),
`discocast-admin-dev.md` (this site's admin + sharing).

## Open items

0. **macOS projector output (top product gap).**
   - ✅ **Step 1 done 2026-10-11** (`winamp-screen` `987531a`, ships in the next app build): dead output-window and
     Virtual Camera UI hidden in the desktop app, replaced with projector instructions; the macOS projector
     checklist is in `output-dev.md`.
   - ⏭ **Step 2 (decided: Approach A, gated by a test):** a Rust-created second window, fullscreen on the
     projector, showing frames read back from the main canvas (transport proven by NDI N0). **First a quick test
     build on the real projector wired to the Mac mini**, to measure delay and smoothness. If it lags, fall back to
     B (render on the projector + a control window) or Syphon. Needs the projector connected; plan + go-ahead first.
0b. **Preset validation was never built, but the public gallery shipped.** `discocast-preset-validation-dev.md`
   requires validation *before* the gallery, because presets contain equations the app compiles and runs as code.
   Today the only gate is manual admin approval in `/admin`. Review approvals carefully until it's built.
1. **Deploy Beta Oct 11, 2026 in Coolify** if it hasn't been done yet. Both
   installers are pushed: the macOS `.dmg` was user-tested, and the Windows
   `.exe` came from GitHub run `38164720369`, built from commit `9fe567c`.
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
