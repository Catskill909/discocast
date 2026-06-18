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
const crypto = require('crypto');
const multer = require('multer');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // behind Coolify's proxy

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'promo');
// Resolve to absolute so res.sendFile / res.download work regardless of cwd.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
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

// --- admin auth -------------------------------------------------------------
// The admin console (/admin) and all /api/* management routes are gated by the
// admin key (reuses STATS_KEY — no extra env var). The key is sent as the
// `x-admin-key` header by the console, or `?key=` for convenience.
function adminKey(req) {
  return req.get('x-admin-key') || req.query.key || '';
}
function isAdmin(req) {
  return !STATS_KEY || adminKey(req) === STATS_KEY; // open only if key unset (dev)
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// --- submission storage -----------------------------------------------------
// Each preset submission lives at DATA_DIR/submissions/<id>/ on the volume:
//   meta.json  — { id, name, description, email, status, createdAt, image, presetBytes }
//   preset.json — the uploaded DiscoCast export
//   image.<ext> — the thumbnail
const SUB_DIR = path.join(DATA_DIR, 'submissions');
fs.mkdirSync(SUB_DIR, { recursive: true });

function newId() {
  return crypto.randomBytes(6).toString('hex');
}
function metaPath(id) { return path.join(SUB_DIR, id, 'meta.json'); }
function readMeta(id) {
  try { return JSON.parse(fs.readFileSync(metaPath(id), 'utf8')); }
  catch { return null; }
}
function writeMeta(id, meta) {
  const tmp = metaPath(id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2));
  fs.renameSync(tmp, metaPath(id));
}
function listSubmissions() {
  let ids = [];
  try { ids = fs.readdirSync(SUB_DIR); } catch { /* none yet */ }
  return ids
    .map(readMeta)
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// --- multipart upload (memory, then written to the volume) ------------------
const IMAGE_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};
// Preset .json can be large — exports may embed video, so allow plenty of room.
// The preview image stays small. multer only supports one global fileSize, so
// the hard ceiling is the preset cap and the image cap is enforced in-handler.
const MAX_PRESET_MB = 80;
const MAX_IMAGE_MB = 12;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRESET_MB * 1024 * 1024, files: 2 },
});

// Run the multer upload middleware but translate its errors (chiefly an
// oversized file) into a clean JSON 4xx. Without this, multer calls next(err)
// and Express's default handler returns a bare HTML 500 with a stack trace —
// which is what made the submit form appear "broken" for any large file.
const uploadFields = upload.fields([{ name: 'preset', maxCount: 1 }, { name: 'image', maxCount: 1 }]);
function handleUpload(req, res, next) {
  uploadFields(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `The preset file must be under ${MAX_PRESET_MB} MB.`
        : 'Upload failed — please check your files and try again.';
      return res.status(413).json({ error: msg });
    }
    console.error('[submit] upload error:', err.message);
    return res.status(400).json({ error: 'Upload failed — please try again.' });
  });
}

// crude in-memory per-IP rate limit for public submissions
const submitHits = new Map(); // ip -> [timestamps]
function rateLimited(ip, max = 5, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const arr = (submitHits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  submitHits.set(ip, arr);
  return arr.length > max;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- admin API --------------------------------------------------------------
app.get('/api/stats', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...counts, total: counts.downloads.mac + counts.downloads.windows });
});

app.post('/api/stats/reset', requireAdmin, (req, res) => {
  counts = { pageViews: 0, downloads: { mac: 0, windows: 0 },
             firstSeen: new Date().toISOString(), updated: null };
  saveCounts();
  res.json({ ok: true });
});

app.get('/api/submissions', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(listSubmissions());
});

app.get('/api/submissions/:id/image', requireAdmin, (req, res) => {
  const m = readMeta(req.params.id);
  if (!m || !m.image) return res.status(404).end();
  res.sendFile(path.join(SUB_DIR, req.params.id, m.image));
});

app.get('/api/submissions/:id/preset', requireAdmin, (req, res) => {
  const m = readMeta(req.params.id);
  const f = path.join(SUB_DIR, req.params.id, 'preset.json');
  if (!m || !fs.existsSync(f)) return res.status(404).end();
  // Download as the preset's name, sanitized for the filesystem.
  const safe = (m.name || '').replace(/[^a-z0-9_\- ]+/gi, '').trim().replace(/\s+/g, '-').slice(0, 60);
  res.download(f, `${safe || req.params.id}.json`);
});

function setStatus(req, res, status) {
  const m = readMeta(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  m.status = status;
  m.reviewedAt = new Date().toISOString();
  writeMeta(req.params.id, m);
  res.json({ ok: true, status });
}
app.post('/api/submissions/:id/approve', requireAdmin, (req, res) => setStatus(req, res, 'approved'));
app.post('/api/submissions/:id/reject',  requireAdmin, (req, res) => setStatus(req, res, 'rejected'));

app.delete('/api/submissions/:id', requireAdmin, (req, res) => {
  try { fs.rmSync(path.join(SUB_DIR, req.params.id), { recursive: true, force: true }); }
  catch { /* already gone */ }
  res.json({ ok: true });
});

// --- public submission endpoint ---------------------------------------------
// Defences (no captcha, no third party): multi-step client flow, honeypot field,
// bot-UA block, per-IP rate limit, size caps, strict validation, and the fact
// that NOTHING is public until an admin approves it.
app.post('/api/submit', handleUpload, (req, res) => {
  if (isBot(req)) return res.status(403).json({ error: 'forbidden' });

  // Honeypot: real users never fill this hidden field. Pretend success, store nothing.
  if ((req.body.website || '').trim() !== '') return res.json({ ok: true });

  const ip = req.ip || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many submissions, try later.' });

  const name = (req.body.name || '').trim().slice(0, 80);
  const description = (req.body.description || '').trim().slice(0, 1000);
  const email = (req.body.email || '').trim().slice(0, 120);
  const presetFile = req.files?.preset?.[0];
  const imageFile = req.files?.image?.[0];

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!description) return res.status(400).json({ error: 'Description is required.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!presetFile) return res.status(400).json({ error: 'A preset .json file is required.' });
  if (!imageFile) return res.status(400).json({ error: 'A preview image is required.' });
  if (imageFile.size > MAX_IMAGE_MB * 1024 * 1024) {
    return res.status(413).json({ error: `The preview image must be under ${MAX_IMAGE_MB} MB.` });
  }

  // Preset must be valid JSON (a real DiscoCast export parses cleanly).
  let presetText;
  try {
    presetText = presetFile.buffer.toString('utf8');
    JSON.parse(presetText);
  } catch {
    return res.status(400).json({ error: 'The preset file is not valid JSON.' });
  }
  const ext = IMAGE_TYPES[imageFile.mimetype];
  if (!ext) return res.status(400).json({ error: 'Image must be PNG, JPG, WEBP, or GIF.' });

  const id = newId();
  const dir = path.join(SUB_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'preset.json'), presetText);
  fs.writeFileSync(path.join(dir, `image.${ext}`), imageFile.buffer);
  writeMeta(id, {
    id, name, description, email,
    status: 'pending',
    createdAt: new Date().toISOString(),
    image: `image.${ext}`,
    presetBytes: presetFile.size,
  });
  res.json({ ok: true, id });
});

// --- legacy /stats (kept; same key, ?key=) ----------------------------------
app.get('/stats.json', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized — add ?key=' });
  res.set('Cache-Control', 'no-store');
  res.json(counts);
});
app.get('/stats', (req, res) => res.redirect('/admin'));

// healthcheck
app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

// --- static promo page ------------------------------------------------------
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// Safety net: any unhandled error returns a terse message, never a stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, '-', err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`[discocast] promo server on :${PORT}`);
  console.log(`[discocast] serving ${PUBLIC_DIR}`);
  console.log(`[discocast] counts -> ${COUNTS_FILE}`);
  console.log(`[discocast] /stats ${STATS_KEY ? 'requires ?key=' : 'is OPEN (set STATS_KEY!)'}`);
});
