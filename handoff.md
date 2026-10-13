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

## ▶ NEXT SESSION STARTS HERE

**✅ 2026-10-12: the macOS projector output WORKS.** Signed test DMG on the Mac mini → onn USB-C→HDMI cable → Vankyo
projector (extended, LG main): **30 fps, ~40–53 ms delay, in time with the music**; video presets play. Details in
`output-dev.md` 🟢 B2 block.

**Projector setup that works (one machine, the Mac mini):** cable straight into a back USB-C port → macOS treats the
projector as a "TV" and asks first → run `winamp-screen/scripts/keep-lg-main.swift` (Claude runs it), then the user
picks **Screen Mirroring → S2-TEK TV → Choose Content → Extend**. The helper puts the LG back as main. Then in the app:
**O → Display 2 → Fullscreen on open → Open output window**. (`D` toggles the stats readout.)

**⚠ Then a freeze on the projector test (fixed 2026-10-12, `a8bf8bd`):** the player froze for good mid-show. Cause: custom presets
with 1–3 Custom Shapes threw every frame (the editor pads shapes to 4, the player didn't), and the render loop died on the
first frame error. Both fixed + verified (4-min favorites cycle, 0 errors). Write-up: `winamp-screen/docs/bugs/player-freeze-custom-shapes.md`.
**Then a second freeze cause (fixed 2026-10-12, `b8b9828`):** switching to another app over the DiscoCast window froze
it, because WKWebView pauses rendering for covered windows. Fixed by turning occlusion detection off + an App Nap opt-out
in `main.rs` (covered window: 0 fps → 100 fps, measured). Test build with everything:
`~/Desktop/DiscoCast-test/DiscoCast-Visualizer-OUTPUT-TEST-4.dmg`: **user confirmed everything working.**

**Then the Output panel redesign (2026-10-12, `1624b77`):** display buttons, Fullscreen switch, Send/Stop button, Tips;
dropdowns visible. Also fixed: desktop-only hiding didn't apply in the player (runtime `<style>` blocked by Tauri's
CSP hashing → moved to `src/platform.css`). Test build: `OUTPUT-TEST-5.dmg`: **user confirmed the new menu looks great.**

**Then: long audio files load instantly (2026-10-12, `b115d8b`).** The desktop picker used to read the whole file and
base64 it over IPC (a 245 MB / 1h47 MP3 = 25 s of spinner). Now it streams from disk (`pick_audio_path` + asset protocol,
shared `pickAudioFileDesktop()` in player/editor/timeline): 0.4 s to playing, seek 55 ms, analyser OK. Test build:
`~/Desktop/DiscoCast-test/DiscoCast-Visualizer-OUTPUT-TEST-6.dmg` (all fixes so far; older test DMGs deleted).
**✅ User confirmed TEST-6 "works fantastic" (2026-10-12).** **Released as Beta Oct 12, 2026.**

**To check next:** in TEST-5 the user clicked the player's **Live** (🎤) button by accident and said the app froze and "the menu
doesn't load". This likely matches the documented macOS limit in `winamp-screen/live-input-dev.md` (main page: the device
picker can hang on first connect because the AudioContext was created without a user gesture). Reproduce in `tauri dev`
before fixing; it's unrelated to the output work.

**Next steps (pick with the user):**
1. **Release prep:** hide the `D` readout by default; then build + ship (What's New: projector output window,
   desktop UI cleanup, caffeinate fix). See *On `main` but NOT in a released build* below.
2. **Timeline output on the B2 pipe** (feed its composer canvas): the Timeline's routing/Composed Program is still
   web-only.
3. **Open question from the test:** the user said favorites "aren't here," but all **9 favorites are saved and all 9
   presets exist** on the Mac mini (checked in the app's local storage + `presets/` folder). Ask where they saw
   "none" (♥ tab vs. cycle panel). Also offered: remember cycle settings (Favorites only / Random / interval) across
   launches. Today "Favorites only" resets to off on every launch.
   (The user later said "favorites ran out"; that was actually the freeze above.)
4. Optional: an in-app "make this my main screen" button (same fix as the helper).

## Current state

- **Latest app build:** **Beta Oct 12, 2026** (`winamp-screen` `f1fc2cc`). Both installers are in `promo/` and pushed:
  the macOS `.dmg` (signed, notarized, user-tested as TEST-6) and the Windows `.exe` (GitHub run `38339443680`, same
  commit). **Windows was not tested** for the new desktop output window or audio streaming.
- **Site:** has a What's New section, and its popup now shows once per release
  (see [README → What's New + popup](README.md#whats-new--popup)).
- **Projector / output on macOS:** the **released** build can only fullscreen the whole app on a display (its
  *Open output window* button silently does nothing: `window.open` is unsupported in Tauri 1). **On `main`** the
  player/editor output window now works (B2 beta, ~25 ms); Timeline output is still web-only (hidden on desktop).
  NDI is disabled. The `output-dev.md` 🚨 table has released vs code side by side.
- **Released in Beta Oct 12, 2026:** clean projector output window (macOS; Windows untested), freeze fixes (custom
  shapes, unkillable render loop, keeps rendering when covered), instant long-audio streaming, Output panel redesign,
  caffeinate fix, `D` readout hidden by default. Site What's New + feature cards updated (Virtual Camera card replaced;
  Timeline per-zone routing marked browser-only).
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
  Sidecars in `src-tauri/binaries/`: a native `ffmpeg` (bundled) and `ndi-send` (**not** bundled; NDI is parked).
- **Desktop output (B2):** `src/output/nativeFeed.js` (copies frames after `render()` via `engine.addFrameTap`),
  `src/output/nativeOutputWindow.js` (output window), Rust `output_*` commands + the `dcframe://` protocol.
  `src/platform.js` sets `html.is-desktop` for `data-web-only` / `data-desktop-only` markup.
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
- **Test DMG without touching the site:** `PROMO_REPO=<scratch dir with promo/index.html> ./build-and-sign.sh`
  writes the signed DMG there instead of into `discocast/promo/`.
- **Projector hardware:** read the checklist + the hub finding in `output-dev.md` *before* plugging anything in.

## Doc catalogue

**The complete, maintained index is `winamp-screen/README.md` → Developer Documentation Index** (every `.md`,
with status). It's not duplicated here, so the two can't drift apart. Quick pointers to the most-used truth docs:
`output-dev.md` (output/projector), `video-dev.md` (video), `timeline-editor.md`, `custom-preset-editor.md`
(Preset Studio), `animation-dev.md`, `milkdrop-tools-dev.md`, `apng-dev.md` (macOS-app video lessons),
`discocast-admin-dev.md` (this site's admin + sharing).

## Open items

0. **macOS projector output (top product gap).**
   - ✅ **Step 1 done 2026-10-11** (`987531a`): output UI that can't work on desktop is hidden there (Timeline
     routing/Composed Program, Virtual Camera); the macOS projector checklist is in `output-dev.md`. (The
     player/editor output panel was hidden in this step, then re-enabled by step 2.)
   - 🟢 **Step 2 BUILT 2026-10-11 for player + editor** (`winamp-screen` `6fcc658`): *Send to display → Open
     output window* works in the desktop app. A Rust-created window pulls copied frames over `dcframe://`. Measured
     in `tauri dev`: **1080p/30, ~25 ms delay, no main-window cost.** Details in `output-dev.md` 🟢 B2 block.
   - ⏭ **Pending:** the user's real-projector test. See **▶ NEXT SESSION** at the top (Mac mini only + USB-C→HDMI
     cable; the test DMG is on the Mac mini's Desktop). Check a **video preset** in the DMG (VP9 `SecurityError` risk). If it passes: Timeline next (feed its composer canvas into the same pipe),
     then a release. Readout default (shown, toggle with **D**) should become hidden before release.
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

## Possible future dev (not scheduled)

- **Installer cleanup on first launch (macOS).** When the app first opens from /Applications and the installer
  disk is still mounted, offer *"Eject the DiscoCast installer and move it to the Trash?"* Also warn if the app
  is running straight from the DMG (not copied to Applications). Rust: find the image via `hdiutil info`,
  then `hdiutil detach`. Trashing a DMG in ~/Downloads may trigger a macOS privacy prompt, so eject-only may be
  the safer default. (A `.pkg` installer would get "move to Trash" for free, but needs a different cert and build.
  Not worth it.) Deferred 2026-10-11 by the user: projector output first.

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
- **Releases:** Beta Oct 11, 2026 shipped (DMG + Windows `.exe`); macOS + Windows builds now run in parallel
  (Windows via `gh`, repo `Catskill909/visualizer`).
- **Doc audit:** README platform-support matrix; all docs indexed with true status; desktop-first rule in
  `CLAUDE.md`; output truth doc shows released vs code.
- **Desktop output:** dead UI hidden, then the B2 output window built + measured (1080p/30, ~25 ms).
- **Fixed:** orphaned `caffeinate` after quit (on `main`, next build).
- **Hardware finding:** the cheap USB-C hub gives no video on the Mac mini (USB Billboard). Use a USB-C→HDMI cable.
