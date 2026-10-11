# DiscoCast — promo page (standalone)

The public promo / download page for **DiscoCast Visualizer**, split out of the
main app repo so it deploys as its own Coolify container. Nothing here touches
the visualizer web app, the macOS `.dmg`, or the Windows `.exe` build.

Live at: **https://discocast.supersoul.top**

> New here / new chat? Read **[handoff.md](handoff.md)** first: system map across
> both repos, release flow, doc catalogue, and open issues.

## What it does

A tiny Express server (`server.js`) that:

1. **Serves** the promo page from [`promo/`](promo/) (HTML, CSS, images, favicon,
   and the installers).
2. **Counts** — itself, no third party, no Cloudflare, no analytics SaaS:
   - **page views** — every `GET /`
   - **downloads, split macOS vs Windows** — because this same server hands over
     the installer file, it counts the *actual file fetch* (the most accurate
     download number, not just a button click).
3. Exposes a private **`/stats`** dashboard (and `/stats.json`).
4. Accepts **preset submissions** at **`/submit`** and reviews them in a private
   **`/admin`** console (see [Preset submissions](#preset-submissions)).

## Layout

```
discocast/
├── handoff.md         # start here: system map, doc catalogue, open issues
├── server.js          # serve + counting + /stats + security headers (CSP)
├── package.json       # express only
├── Dockerfile         # node:20-alpine, serves on :3000
├── promo/             # the page + ALL assets — the web root
│   ├── index.html
│   ├── submit.html       # public preset-submission wizard  (/submit)
│   ├── presets.html      # public approved-presets gallery  (/presets)
│   ├── admin.html        # private review console           (/admin)
│   ├── style.css
│   ├── favicon.svg
│   ├── *.png
│   ├── version.json
│   ├── DiscoCast-Visualizer.dmg                       # macOS installer
│   └── DiscoCast Visualizer_0.1.0_x64-setup.exe       # Windows installer
└── data/              # counts.json + submissions/ (gitignored; Coolify volume in prod)
```

## Where the installers come from (important)

The installers are **built in the main `winamp-screen` repo** and delivered here:

- **macOS** — `winamp-screen/build-and-sign.sh` builds, signs, and notarizes the
  app, then writes the finished `.dmg`, `version.json`, and the version span in
  `index.html` **into `../discocast/promo/`** (this repo, assumed a sibling
  folder of `winamp-screen`). After a build, commit + push this repo.
- **Windows** — the `build-windows.yml` GitHub Action in `winamp-screen` produces
  the `.exe` artifact; drop it into `promo/` here (stable name above), commit, push.

The download buttons in `promo/index.html` point at those two exact filenames.
Versioned copies the build script also writes (`DiscoCast Visualizer-1.0.*.dmg`)
are gitignored; only the stable names ship.

## What's New + popup

Release notes live in **one place**: the `#whats-new` section of
`promo/index.html`. Each release is an `<article class="release"
data-release="YYYY-MM-DD">` block, newest first, and older notes sit under
**Earlier updates**.

The popup (`#beta-modal`) is filled by JS from the **newest** release block. It
opens only if the visitor hasn't seen that release yet: on dismiss, the
release's `data-release` id is saved in `localStorage`
(`discocast-whats-new-seen`).

**To announce a new build:** add a new release block at the top of
`#whats-new` with a new `data-release` id, and move the previous block's items
into **Earlier updates** if you want the page to stay short. Everyone sees the
popup once more, showing only the new items. The popup's "Latest build" label
comes from `version.json`, which the macOS build script writes.

## Release checklist

1. `winamp-screen/build-and-sign.sh`: macOS `.dmg` + `version.json` land in
   `promo/`.
2. GitHub → winamp-screen → Actions → **Build Windows Installer** → download the
   artifact → save it as `promo/DiscoCast Visualizer_0.1.0_x64-setup.exe`.
3. Add a release block to `#whats-new` (see above). Add bigger features to the
   feature sections of the page too.
4. Commit + push `main`, then deploy in Coolify.

## Run locally

```sh
npm install
npm start            # http://localhost:3000   (stats: /stats)
```

## Deploy on Coolify

1. New application → this Git repo → **Dockerfile** build pack.
2. Domain: `discocast.supersoul.top`. Container port **3000**.
3. **Add a persistent volume** mounted at **`/data`** (the Dockerfile sets
   `DATA_DIR=/data`). Without it, counters reset on every redeploy.
4. Set env **`STATS_KEY`** to a secret. It gates both `/stats` and the `/admin`
   review console / `/api/*` routes, which then require `?key=THATVALUE` (if
   unset they're open — don't ship without it).

## Stats

- `GET /stats?key=…` — small HTML dashboard (views, mac/windows/total downloads).
- `GET /stats.json?key=…` — raw JSON.

## Preset submissions

Users share visualizer-export presets through a moderated flow — nothing is
public until an admin approves it.

- **`/submit`** — a public multi-step wizard (`promo/submit.html`) that uploads a
  preset `.json` plus a preview image to **`POST /api/submit`**.
- **`/admin`** — a private console (`promo/admin.html`) to review, download,
  approve, or reject submissions. Gated by the same key as `/stats`: the console
  sends it as the `x-admin-key` header, or pass `?key=…`.

Each submission is stored on the Coolify volume at
`DATA_DIR/submissions/<id>/` (`meta.json`, `preset.json`, `image.<ext>`).

### File-size limits (important)

Presets can be large because exports may embed video. The limits live in
`server.js` as `MAX_PRESET_MB` and `MAX_IMAGE_MB`, and the client mirrors them in
`promo/submit.html`:

| File   | Limit            | Constant         |
| ------ | ---------------- | ---------------- |
| preset `.json` | **80 MB** | `MAX_PRESET_MB`  |
| preview image  | **12 MB** | `MAX_IMAGE_MB`   |

multer enforces a single global cap, so its `fileSize` is set to the preset
limit (the larger one) and the smaller image cap is checked in the handler.
Oversized uploads return a clean **`413`** JSON error — not a 500.

> **If large presets fail after deploy with a `413` that *isn't* our JSON
> message,** the reverse proxy in front is rejecting the body. Coolify's default
> Traefik proxy has no body-size cap, but if a limit has been added it must be
> raised to at least `MAX_PRESET_MB` for submissions to work.

> ⚠️ Bumping `MAX_PRESET_MB` raises per-request memory use: uploads use multer
> **memory** storage, so the whole file is held in RAM while being written to the
> volume. Keep the container's memory in mind before raising it much further.
