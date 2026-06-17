// DiscoCast promo server — serves the promo page AND counts page views +
// per-OS downloads itself (no third party, no Cloudflare, fully self-hosted).
//
// Why this exists: the promo page used to be served by the main app's nginx,
// which counted nothing. Here the SAME server that hands over the .dmg / .exe
// sees every download request, so it can count the actual file fetch (the most
// accurate download number) split by macOS vs Windows.
//
// Counters persist to a JSON file under DATA_DIR. In production DATA_DIR points
// at a mounted Coolify volume so the numbers survive container restarts/redeploys.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // behind Coolify's proxy

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'promo');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const COUNTS_FILE = path.join(DATA_DIR, 'counts.json');
const STATS_KEY = process.env.STATS_KEY || ''; // gate for /stats; empty = open (set it in prod)

// The two installer paths the promo Download buttons point to (relative ./ in
// promo/index.html resolve to these from the served root). Counting matches the
// decoded request path against these exactly.
const MAC_FILE = '/DiscoCast-Visualizer.dmg';
const WIN_FILE = '/DiscoCast Visualizer_0.1.0_x64-setup.exe';

// --- counters --------------------------------------------------------------
let counts = {
  pageViews: 0,
  downloads: { mac: 0, windows: 0 },
  firstSeen: null,
  updated: null,
};

function loadCounts() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(COUNTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(COUNTS_FILE, 'utf8'));
      counts = {
        ...counts,
        ...raw,
        downloads: { ...counts.downloads, ...(raw.downloads || {}) },
      };
    }
  } catch (e) {
    console.error('[counts] load failed, starting fresh:', e.message);
  }
  if (!counts.firstSeen) counts.firstSeen = new Date().toISOString();
}

function saveCounts() {
  counts.updated = new Date().toISOString();
  try {
    const tmp = COUNTS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(counts, null, 2));
    fs.renameSync(tmp, COUNTS_FILE); // atomic — never leaves a half-written file
  } catch (e) {
    console.error('[counts] save failed:', e.message);
  }
}

loadCounts();

// --- security headers (replaces the old nginx CSP for this standalone app) --
// Allows exactly what the promo page needs: its own inline <script> (version
// fetch + beta modal), Google Fonts via the style.css @import, data/blob images.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Content-Security-Policy', CSP);
  next();
});

// --- bot / non-human filtering ---------------------------------------------
// A fresh public domain gets hammered by health checks, crawlers, security
// scanners, and link-preview unfurlers. We only want to count real humans, so:
//   - page views require a browser-style Accept: text/html
//   - both views and downloads skip known bot / tool user-agents (and empty UAs)
const BOT_UA = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|quora|pinterest|redditbot|slackbot|telegram|whatsapp|discord|skypeuripreview|preview|monitor|uptime|pingdom|statuscake|curl|wget|python-requests|go-http-client|java\/|okhttp|headless|phantomjs|axios|libwww|scrapy|httpclient|apache-httpclient/i;

function isBot(req) {
  const ua = req.headers['user-agent'] || '';
  return !ua || BOT_UA.test(ua);
}

function acceptsHtml(req) {
  return (req.headers['accept'] || '').includes('text/html');
}

// A download counts once per "fresh" GET. Browsers triggered by the `download`
// attribute issue a single plain GET; resumable/range fetches send a Range
// header for the continuation — we only count the start so retries don't inflate.
function isFreshGet(req) {
  const r = req.headers.range;
  return !r || r.startsWith('bytes=0-');
}

// --- counting middleware (runs BEFORE static, then passes through) ----------
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (isBot(req)) return next(); // never count bots/tools/health checks

  let p = req.path;
  try { p = decodeURIComponent(req.path); } catch { /* keep raw */ }

  if (p === MAC_FILE && isFreshGet(req)) {
    counts.downloads.mac++; saveCounts();
  } else if (p === WIN_FILE && isFreshGet(req)) {
    counts.downloads.windows++; saveCounts();
  } else if ((p === '/' || p === '/index.html') && acceptsHtml(req)) {
    counts.pageViews++; saveCounts();
  }
  next();
});

// --- private stats ----------------------------------------------------------
function statsAuthed(req) {
  return !STATS_KEY || req.query.key === STATS_KEY;
}

app.get('/stats.json', (req, res) => {
  if (!statsAuthed(req)) return res.status(401).json({ error: 'unauthorized — add ?key=' });
  res.set('Cache-Control', 'no-store');
  res.json(counts);
});

app.get('/stats', (req, res) => {
  if (!statsAuthed(req)) {
    return res.status(401).type('text/plain').send('Unauthorized — append ?key=YOUR_STATS_KEY');
  }
  const total = counts.downloads.mac + counts.downloads.windows;
  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<title>DiscoCast — stats</title>
<style>
  body{font:16px/1.5 -apple-system,system-ui,sans-serif;background:#0c0c10;color:#e8e8ef;
       max-width:560px;margin:48px auto;padding:0 20px}
  h1{font-size:20px;font-weight:600;margin:0 0 24px}
  .grid{display:grid;grid-template-columns:1fr auto;gap:10px 24px}
  .grid .n{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .muted{color:#8a8a99;font-size:13px;margin-top:28px}
  hr{border:0;border-top:1px solid #26262e;margin:18px 0}
</style></head><body>
<h1>DiscoCast — promo stats</h1>
<div class="grid">
  <div>Page views</div><div class="n">${counts.pageViews}</div>
  <hr><hr>
  <div>Downloads — macOS</div><div class="n">${counts.downloads.mac}</div>
  <div>Downloads — Windows</div><div class="n">${counts.downloads.windows}</div>
  <div>Downloads — total</div><div class="n">${total}</div>
</div>
<p class="muted">Counting since ${counts.firstSeen || '—'}<br>Last update ${counts.updated || '—'}</p>
</body></html>`);
});

// healthcheck
app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

// --- static promo page ------------------------------------------------------
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`[discocast] promo server on :${PORT}`);
  console.log(`[discocast] serving ${PUBLIC_DIR}`);
  console.log(`[discocast] counts -> ${COUNTS_FILE}`);
  console.log(`[discocast] /stats ${STATS_KEY ? 'requires ?key=' : 'is OPEN (set STATS_KEY!)'}`);
});
