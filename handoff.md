# DiscoCast — Handoff

> Start here in a new chat. The map of the whole DiscoCast system: both repos, how they ship, where the docs
> are, the current state, and **what to do next**. Keep *Next tasks* and *Current state* true. Put deep detail
> in the linked truth docs, not here.
>
> Last updated: **2026-10-12** (end-of-day audit)

## Read this first: how not to miss things

1. **This file** gives the system map, current state, and the task list.
2. **`winamp-screen/README.md` → Platform support** shows what works on web vs the **macOS DMG** vs Windows.
   **The DMG is the product.** Many browser features silently do nothing in the Mac app.
3. **`winamp-screen/README.md` → Developer Documentation Index** lists *every* doc with its status. Find the
   topic's **truth doc** there.
4. **Before working on a topic, read its truth doc's status block** (e.g. `output-dev.md` 🚨 table + Phase Board,
   `animation-dev.md` dashboard).
5. `winamp-screen/CLAUDE.md` has the house rules: plan first + wait for "go ahead", one truth doc per topic,
   desktop-first.

## ▶ Next tasks (prioritized; confirm order with the user)

**Focus: macOS.** The Mac is what goes to the user's upcoming **live dance event with a projector**.

1. **Deploy Beta Oct 12, 2026 in Coolify** (if not done yet), then verify the live site:
   `https://discocast.supersoul.top/version.json` says *Beta Oct 12, 2026*, both download buttons serve the new
   files, and the What's New popup shows the Oct 12 release once.
2. **Gig dry run on the Mac** (offered; not started): projector connected (setup below), a full set of
   favorites auto-cycle, a long mix, switching to other apps, maybe the Timeline. Find rough edges at home, not at
   the venue.
3. **Check the Live (🎤) button.** In a test build the user clicked *Live* by accident and said the app froze and
   "the menu doesn't load". This likely matches the documented macOS limit in `winamp-screen/live-input-dev.md`
   (main page: the device picker can hang on first connect because the AudioContext was created without a user
   gesture). Reproduce in `tauri dev` first.
4. **Windows smoke test in GitHub Actions** (the user wants it; "not now"). Install and run the real `.exe` on
   GitHub's Windows runner with a test mode; log frames, frame errors, the output window receiving frames, and
   long-audio streaming. Limits: software GPU (no perf numbers), no audio device, no projector. Plan first.
5. **Windows manual test** of Beta Oct 12 when the user has hardware (they only have an old laptop; a GPU PC is on
   their wishlist; Shadow cloud PC was judged not worth it long-term). Projector output + audio streaming are
   **untested on Windows**.
6. **Timeline output on the desktop B2 pipe:** feed the Timeline's composer canvas into `nativeFeed`; its
   routing/Composed Program are still web-only (hidden on desktop).
7. **Smaller, offered:**
   - Remember cycle settings across launches. "Favorites only" / Random / interval reset on every launch today.
   - Editor `_addVideoLayer` likely hits the one-time WKWebView 1-second first-draw freeze; apply the
     `_prepareVideo` warm-up.
   - An in-app "make this my main screen" button (same fix as `scripts/keep-lg-main.swift`).
8. **Security gap (no request yet):** preset validation (`discocast-preset-validation-dev.md`) was never built,
   but the public `/presets` gallery shipped. Presets contain equations the app runs as code, so manual admin
   approval in `/admin` is the only gate. Review approvals carefully.

## Projector setup that works (macOS, one machine)

Mac mini + LG (main) + Vankyo projector. **The MacBook is only a Universal Control keyboard/mouse; never plug the
projector into it, and never turn off the Mac mini's Wi-Fi.**

1. **Cable:** the onn USB-C→HDMI cable straight into a **back USB-C port of the Mac mini**. The cheap hub gives no
   video on the mini (USB Billboard class; don't retry it). Projector input = HDMI, its own Wi-Fi/AirPlay off.
2. macOS treats the projector as a **TV** and keeps it off until you choose. Claude builds + runs
   `winamp-screen/scripts/keep-lg-main.swift` (`swiftc -O … -o keep-lg-main`), *then* the user picks **Screen
   Mirroring → S2-TEK TV → Choose Content → Extend**. Without the helper, Extend makes the projector main and the LG
   goes black. Verify with `system_profiler SPDisplaysDataType`: LG main, S2-TEK TV listed, Mirror: Off.
3. In the app: **O → Send to display → click Display 2 → Fullscreen on → ▶ Send to Display 2**. `D` in the output
   window toggles stats. Measured: 30 fps, ~40–53 ms, in sync.

Full checklist + hardware findings: `winamp-screen/output-dev.md` (🎯 checklist, ⚠️ hub finding, June field notes).

## Current state

- **Latest release: Beta Oct 12, 2026** (`winamp-screen` `f1fc2cc`), pushed to `discocast/promo/`: macOS `.dmg`
  (signed, notarized, user-tested) + Windows `.exe` (GitHub run `38339443680`, same commit). Site What's New +
  feature cards updated (the Virtual Camera card was replaced with real projector output; Timeline per-zone routing
  is marked browser-only).
- **Desktop app, as released:**
  - **Output:** clean projector/second-screen window from the player + editor (B2), and fullscreen-the-app (B1).
    Timeline output routing is web-only (hidden on desktop). NDI is disabled. Virtual Camera is hidden.
  - **Playback:** keeps rendering when covered by other apps; the render loop survives frame errors; long audio
    streams from disk; videos preload before preset switches.
- **Both repos are pushed to `main`.** Production updates only when the user deploys in Coolify.

## The two repos

DiscoCast is **two sibling repos** in `~/Desktop/`:

| Repo | What it is | Ships as |
| --- | --- | --- |
| **`winamp-screen/`** (GitHub: `Catskill909/visualizer`, public) | The app: **DiscoCast Visualizer**. Butterchurn/MilkDrop WebGL visualizer + Preset Studio (`editor.html`) + Timeline (`timeline.html`) + output window. Vanilla JS + Vite 8, wrapped in **Tauri 1** for desktop. | macOS `.dmg` (signed + notarized), Windows `.exe` (GitHub Action), web build (nginx Docker) |
| **`discocast/`** (this repo; GitHub: `Catskill909/discocast`) | The **promo / download site** + community preset sharing. Small Express server. | Docker container on Coolify → **https://discocast.supersoul.top** |

`discocast` never touches the app code. It only hosts the installers that `winamp-screen` builds.

## How the user works

- **Always on `main`.** Never branch. Commit + push, then the user deploys in Coolify.
- **In `winamp-screen`, plan first:** what happens now, what should happen, what will change; wait for "go ahead".
- **One truth doc per topic.** Update the existing `*-dev.md`; bug write-ups go in `winamp-screen/docs/bugs/`.
- **Verify in the real desktop app** (`tauri dev` or a signed DMG), not just the browser.
- **Keep it short and calm.** One step at a time; give the user one clear action. The user tests on real
  hardware and gets frustrated by long instruction lists and two-machine confusion.

## discocast (this repo) at a glance

- `server.js`: the backend. Serves `promo/`, counts page views and per-OS installer downloads (human-only), geo
  tallies (offline `geoip-lite`, no raw IPs), preset submissions, the admin API, and the public approved-presets
  API.
- Pages in `promo/`: `index.html` (promo + What's New + once-per-release popup), `submit.html` (`/submit`),
  `admin.html` (`/admin`, key-gated), `presets.html` (`/presets` gallery).
- Data: `DATA_DIR` (`/data` volume in prod): `counts.json` + `submissions/<id>/…`.
- Auth: env `STATS_KEY` gates `/admin`, `/api/*` admin routes, `/stats.json` (open if unset). `:id` params must
  match `^[a-f0-9]{12}$`.

Full detail: [README.md](README.md) (layout, deploy, What's New + popup, release checklist) and
`winamp-screen/discocast-admin-dev.md`.

## Releasing a new app build

Checklist: [README → Release checklist](README.md#release-checklist). In short: push `winamp-screen` → build
**macOS and Windows in parallel** (`./build-and-sign.sh` + `gh workflow run "Build Windows Installer" -R
Catskill909/visualizer --ref main`) → `gh run download` the `.exe` into `promo/` → add a What's New release block
(new `data-release` id) → push → user deploys. Download buttons + counters only know the **two exact installer
filenames** (`MAC_FILE` / `WIN_FILE` in `server.js`).

- The build script **kills every vite / `tauri dev` process** when it starts; an open dev window freezes. Expected.
- **Test DMG without touching the site:** `PROMO_REPO=<scratch dir containing promo/index.html> ./build-and-sign.sh`.

## winamp-screen (the app) at a glance

- **Player** `src/main.js` + `src/visualizer.js` (`VisualizerEngine`). **Preset Studio** `src/editor/`
  (big file: `inspector.js`). **Timeline** `src/timeline/`. **Output** `src/output/`.
- **Render loop:** `startRenderLoop` → `_renderFrame()` inside try/catch/finally, so a frame error never stops
  rendering; errors are logged and bannered once. `engine.addFrameTap(fn)` runs right after each render.
- **Custom presets:** `src/customPresets.js` + `presetStore.js` (IndexedDB on web, native files on desktop). The
  player pads custom shapes to 4 like the editor (see `docs/bugs/player-freeze-custom-shapes.md`).
- **Video:** preloading via `VisualizerEngine.prepareMedia` (`video-dev.md` §28); FFmpeg.wasm self-hosted
  (`@ffmpeg/core@0.12.9`, works offline; keep it matched to `@ffmpeg/ffmpeg`'s `CORE_VERSION`).
- **Audio (desktop):** `pickAudioFileDesktop()` in `src/fileUtils.js` → Rust `pick_audio_path` (allows that file in
  the asset scope) → `connectAudioFile({ streamUrl })`, streamed with `crossOrigin='anonymous'` so Web Audio
  still analyses it. The old full-read `pick_audio_file` is the fallback.
- **Desktop output (B2):** `nativeFeed.js` (JPEG frame copy → Rust `output_push_frame`) → `nativeOutputWindow.js`
  (pulls `dcframe://`). UI: `outputUI.js` renders *Send to display* into `[data-output-ui]` (player + editor),
  styles in `output-ui.css`.
- **Platform UI:** `src/platform.js` sets `html.is-desktop`; rules live in `src/platform.css`
  (`data-web-only` / `data-desktop-only`). **Never inject `<style>` at runtime:** Tauri hashes the player's inline
  `<style>` into the CSP, so WebKit blocks runtime styles.
- **`src-tauri/src/main.rs`:** output window + frame protocol, `get_blob_path`/asset protocol, `pick_audio_path`,
  `caffeinate -d -w <pid>` (exits with the app), macOS `keep_rendering_when_covered` (WKWebView occlusion off) +
  `disable_app_nap`. `objc` 0.2 is a macOS dependency (its cfg is declared in `[lints.rust]`).
- **CSPs live in two places:** `src-tauri/tauri.conf.json` (desktop) and `nginx.conf` (web).

### Testing the desktop app

- `npm run tauri-dev` runs the real WKWebView app; its console does **not** reach the terminal. Pattern used all
  session: a temporary Rust `dev_log` command + an env-flagged JS harness (`VITE_*_TEST`), **never committed**;
  remove both afterwards and clean up any test data in
  `~/Library/Application Support/app.discocast.visualizer/` (the dev app shares the real user library).
- To prove "keeps rendering when covered": a Swift window that covers the LG for N seconds, then compare frame
  counts (0 fps before the fix, 100 after).
- Playwright covers only the web build; use `headless: false` for real-GPU timings.

## Doc catalogue

**The complete index is `winamp-screen/README.md` → Developer Documentation Index** (every `.md`, with status). It
isn't duplicated here. Most-used truth docs: `output-dev.md` (output/projector), `video-dev.md`,
`timeline-editor.md`, `custom-preset-editor.md`, `animation-dev.md`, `milkdrop-tools-dev.md`, `apng-dev.md` (macOS
video lessons), `live-input-dev.md`, `discocast-admin-dev.md`.

## Decisions

- **Won't fix:** `trust proxy` is `true`, so clients can spoof `X-Forwarded-For` (dodge the submit rate limit, skew
  geo stats). Low impact. If it ever matters: `app.set('trust proxy', 'loopback, linklocal, uniquelocal')`.
- **Deferred (possible future dev):** installer cleanup on first launch (eject the DMG / warn when running from it;
  eject-only is safer than trashing a file in ~/Downloads).
- **OBS:** an optional external route (window-capture the clean output window), not the in-room path.

## Changelog

**2026-10-12** (released as **Beta Oct 12, 2026**)
- **Projector output verified on real hardware.** Mac mini → onn USB-C→HDMI → Vankyo, 30 fps, ~40–53 ms.
- **Freeze fixes:**
  - custom presets with 1–3 shapes crashed every frame in the player (now padded);
  - the render loop died on the first frame error (now it survives);
  - a covered window paused rendering (WKWebView occlusion off + App Nap opt-out).
- **Output panel redesign;** desktop-only hiding fixed (`platform.css`).
- **Long audio streams from disk:** a 245 MB / 1h47 MP3 plays in 0.4 s (was 25 s).
- `D` readout hidden by default; site What's New + honest feature cards.

**2026-10-11** (released as **Beta Oct 11, 2026**)
- Offline video import (FFmpeg self-hosted); smooth video preset switching (preload + asset-protocol reads +
  WKWebView warm-up); bulk import fails cleanly instead of storing audio.
- discocast: path-traversal fix; repo cleanup; What's New section + once-per-release popup.
- Doc audit: platform-support matrix, every doc indexed, desktop-first rule in `CLAUDE.md`.
- Desktop: dead output UI hidden, then the B2 output window built; orphaned `caffeinate` fixed (shipped Oct 12).
- Hardware finding: the cheap USB-C hub gives no video on the Mac mini.
