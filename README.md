# DiscoCast — promo page (standalone)

The public promo / download page for **DiscoCast Visualizer**, split out of the
main app repo so it deploys as its own Coolify container. Nothing here touches
the visualizer web app, the macOS `.dmg`, or the Windows `.exe` build.

Live at: **https://discocast.supersoul.top**

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

## Layout

```
discocast/
├── server.js          # serve + counting + /stats + security headers (CSP)
├── package.json       # express only
├── Dockerfile         # node:20-alpine, serves on :3000
├── promo/             # the page + ALL assets — the web root
│   ├── index.html
│   ├── style.css
│   ├── favicon.svg
│   ├── *.png
│   ├── version.json
│   ├── DiscoCast-Visualizer.dmg                       # macOS installer
│   └── DiscoCast Visualizer_0.1.0_x64-setup.exe       # Windows installer
└── data/              # counters.json (gitignored; on a Coolify volume in prod)
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
4. Set env **`STATS_KEY`** to a secret. `/stats` then requires `?key=THATVALUE`
   (if unset, `/stats` is open — don't ship without it).

## Stats

- `GET /stats?key=…` — small HTML dashboard (views, mac/windows/total downloads).
- `GET /stats.json?key=…` — raw JSON.

## Future

This server is also the intended home for **shared visualizer-export JSON files**
(group sharing of presets/timelines) — a real app we control, not static hosting.
