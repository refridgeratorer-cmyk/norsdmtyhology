// Nordschliefe's Collection - backend. Everything server-side lives in this one file.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
// tiny .env loader (no extra dependency)
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }); } catch {}
const express = require('express'), Database = require('better-sqlite3'), bcrypt = require('bcryptjs'),
  multer = require('multer'), cookieParser = require('cookie-parser');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true }); fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'collection.db'));
const drive = require('./drive');
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, profile_picture TEXT, bio TEXT DEFAULT '', role TEXT NOT NULL DEFAULT 'reader', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS universes(id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT DEFAULT '', content TEXT DEFAULT '',
  icon TEXT DEFAULT 'globe', theme TEXT DEFAULT 'meridian', image TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE, name TEXT NOT NULL,
  slug TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT 'folder', UNIQUE(universe_id, slug));
CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE, title TEXT NOT NULL,
  slug TEXT NOT NULL, description TEXT DEFAULT '', content TEXT DEFAULT '', icon TEXT DEFAULT 'file-text', image TEXT, banner TEXT,
  status TEXT NOT NULL DEFAULT 'published', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(category_id, slug));
CREATE TABLE IF NOT EXISTS votes(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE, vote INTEGER NOT NULL CHECK(vote IN (1,-1)), UNIQUE(user_id, entry_id));
`);

drive.init({ db, dataDir: DATA_DIR, uploadDir: UPLOAD_DIR });

// ---- Writer account (from environment variables) ----
const WU = (process.env.WRITER_USERNAME || '').trim(), WP = process.env.WRITER_PASSWORD || '';
if (WU && WP) {
  const row = db.prepare('SELECT * FROM users WHERE username=?').get(WU), hash = bcrypt.hashSync(WP, 12);
  if (!row) db.prepare("INSERT INTO users(username,display_name,password_hash,role,bio) VALUES(?,?,?, 'writer', 'Keeper of the archive.')").run(WU, WU, hash);
  else { if (!bcrypt.compareSync(WP, row.password_hash)) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, row.id);
         db.prepare("UPDATE users SET role='writer' WHERE id=?").run(row.id); }
} else console.warn('WARNING: WRITER_USERNAME / WRITER_PASSWORD not set. Nobody can use Writer Mode.');

// ---- Seed: only the three project shells. NO categories, NO entries, NO sample lore. ----
if (!db.prepare('SELECT 1 FROM universes').get()) {
  const U = db.prepare('INSERT INTO universes(name,slug,description,icon,theme) VALUES(?,?,?,?,?)');
  db.transaction(() => {
    U.run('The Meridian Archive', 'meridian-archive', 'A cosmic-horror / alternate-dimension / ARG universe centered around the Meridian Watch Authority.', 'eye', 'meridian');
    U.run('The Aurelis Chronicle', 'aurelis-chronicle', 'A large military-historical world of wars, countries, campaigns, battles, maps, newspapers, soldiers, and fictional history.', 'map', 'aurelis');
    U.run('The Meridian Archive: After Hours', 'after-hours', 'The character-focused comedic side of the Meridian universe.', 'users', 'afterhours');
  })();
}

// ---- Helpers ----
const app = express(); app.set('trust proxy', 1); app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' })); app.use(cookieParser());
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, ICON = /^[a-z0-9-]{1,40}$/, THEMES = ['meridian', 'aurelis', 'afterhours', 'azure', 'verdant'];
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const safeUser = u => u && { id: u.id, username: u.username, display_name: u.display_name, profile_picture: u.profile_picture, bio: u.bio, role: u.role, created_at: u.created_at };
app.use('/api', (req, res, next) => { if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) drive.schedule(); }); next(); }); // back up to Drive after any successful change
app.use((req, res, next) => { // session -> req.user (role always comes from the database)
  const t = req.cookies.sid; req.user = null;
  if (t) { const r = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?').get(t, Date.now()); if (r) req.user = r; }
  next(); });
const needUser = (req, res, next) => req.user ? next() : bad(res, 'Please log in first.', 401);
const needWriter = (req, res, next) => req.user && req.user.role === 'writer' ? next() : bad(res, 'Writer access only.', 403);
const isW = req => req.user && req.user.role === 'writer';
function startSession(res, uid) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, uid, Date.now() + 30 * 864e5);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 864e5 }); }
const tries = new Map(); // very small login rate limiter
function limited(req) { const k = req.ip, now = Date.now(), a = (tries.get(k) || []).filter(t => now - t < 6e5); tries.set(k, a); return a.length >= 15; }

// ---- Uploads ----
const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({ limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (q, f, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT[f.mimetype]) }),
  fileFilter: (q, f, cb) => EXT[f.mimetype] ? cb(null, true) : cb(new Error('Only PNG, JPG, WEBP or GIF images are allowed.')) });
const up = field => (req, res, next) => upload.single(field)(req, res, err => err ? bad(res, err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 3 MB).' : err.message) : next());
app.use('/uploads', express.static(UPLOAD_DIR, { setHeaders: r => r.setHeader('X-Content-Type-Options', 'nosniff') }));

// ---- Auth ----
app.post('/api/register', (req, res) => {
  if (limited(req)) return bad(res, 'Too many attempts. Try again later.', 429);
  const username = str(req.body.username, 24), password = String(req.body.password || ''), dn = str(req.body.display_name, 40) || username;
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return bad(res, 'Username must be 3-24 letters, numbers or underscores.');
  if (password.length < 8 || password.length > 100) return bad(res, 'Password must be 8-100 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return bad(res, 'That username is taken.', 409);
  const id = db.prepare("INSERT INTO users(username,display_name,password_hash,role) VALUES(?,?,?, 'reader')").run(username, dn, bcrypt.hashSync(password, 12)).lastInsertRowid;
  startSession(res, id); res.json({ user: safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)) }); });
app.post('/api/login', (req, res) => {
  if (limited(req)) return bad(res, 'Too many attempts. Try again later.', 429);
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(str(req.body.username, 24));
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) { tries.get(req.ip).push(Date.now()); return bad(res, 'Wrong username or password.', 401); }
  startSession(res, u.id); res.json({ user: safeUser(u) }); });
app.post('/api/logout', (req, res) => { if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies.sid); res.clearCookie('sid'); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ user: safeUser(req.user) }));
app.put('/api/me', needUser, up('avatar'), (req, res) => {
  const dn = str(req.body.display_name, 40) || req.user.display_name, bio = str(req.body.bio, 500);
  const pic = req.file ? '/uploads/' + req.file.filename : req.user.profile_picture;
  db.prepare('UPDATE users SET display_name=?, bio=?, profile_picture=? WHERE id=?').run(dn, bio, pic, req.user.id);
  res.json({ user: safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) }); });
app.get('/api/users/:username', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.params.username); if (!u) return bad(res, 'Profile not found.', 404);
  res.json({ user: safeUser(u), votes_given: db.prepare('SELECT COUNT(*) n FROM votes WHERE user_id=?').get(u.id).n }); });
app.post('/api/upload', needWriter, up('image'), (req, res) => req.file ? res.json({ url: '/uploads/' + req.file.filename }) : bad(res, 'No image received.'));

// ---- Reading lore ----
const vis = req => isW(req) ? '' : " AND e.status='published'";
const entrySel = uid => `SELECT e.id,e.title,e.slug,e.description,e.icon,e.image,e.status,c.slug cslug,c.name cname,u.slug uslug,u.name uname,
  (SELECT COUNT(*) FROM votes WHERE entry_id=e.id AND vote=1) up,(SELECT COUNT(*) FROM votes WHERE entry_id=e.id AND vote=-1) down,
  COALESCE((SELECT vote FROM votes WHERE entry_id=e.id AND user_id=${uid | 0}),0) my_vote
  FROM entries e JOIN categories c ON c.id=e.category_id JOIN universes u ON u.id=c.universe_id`;
app.get('/api/universes', (req, res) => {
  const us = db.prepare('SELECT * FROM universes ORDER BY id').all(), cs = db.prepare('SELECT * FROM categories ORDER BY id').all();
  const e = req.user && isW(req) ? '' : " AND status='published'";
  const n = db.prepare(`SELECT category_id, COUNT(*) n FROM entries WHERE 1=1${e} GROUP BY category_id`).all(), cnt = Object.fromEntries(n.map(x => [x.category_id, x.n]));
  res.json({ universes: us.map(u => ({ ...u, categories: cs.filter(c => c.universe_id === u.id).map(c => ({ ...c, count: cnt[c.id] || 0 })) })) }); });
app.get('/api/entries', needWriter, (req, res) => res.json({ entries: db.prepare(entrySel(req.user.id) + ' ORDER BY u.id,c.id,e.id').all() }));
app.get('/api/c/:u/:c', (req, res) => {
  const c = db.prepare('SELECT c.* FROM categories c JOIN universes u ON u.id=c.universe_id WHERE u.slug=? AND c.slug=?').get(req.params.u, req.params.c);
  if (!c) return bad(res, 'Category not found.', 404);
  res.json({ category: c, entries: db.prepare(entrySel(req.user?.id) + ' WHERE c.id=?' + vis(req) + ' ORDER BY e.title').all(c.id) }); });
app.get('/api/e/:u/:c/:e', (req, res) => {
  const row = db.prepare(entrySel(req.user?.id).replace('e.image,', 'e.image,e.banner,e.content,e.created_at,e.updated_at,e.category_id,') + ' WHERE u.slug=? AND c.slug=? AND e.slug=?' + vis(req)).get(req.params.u, req.params.c, req.params.e);
  if (!row) return bad(res, 'Entry not found.', 404);
  const related = db.prepare(entrySel(0) + ' WHERE e.category_id=? AND e.id<>?' + vis(req) + ' LIMIT 4').all(row.category_id, row.id);
  res.json({ entry: row, related }); });
app.get('/api/search', (req, res) => {
  const q = str(req.query.q, 60); if (q.length < 2) return res.json({ results: [] });
  const like = '%' + q.replace(/[%_\\]/g, m => '\\' + m) + '%', out = [];
  db.prepare("SELECT name,slug,description,icon FROM universes WHERE name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' LIMIT 10").all(like, like)
    .forEach(u => out.push({ type: 'Universe', title: u.name, icon: u.icon, path: 'The Collection', href: `#/u/${u.slug}` }));
  db.prepare("SELECT c.name,c.slug,c.icon,u.name un,u.slug us FROM categories c JOIN universes u ON u.id=c.universe_id WHERE c.name LIKE ? ESCAPE '\\' LIMIT 10").all(like)
    .forEach(c => out.push({ type: 'Category', title: c.name, icon: c.icon, path: c.un, href: `#/u/${c.us}/${c.slug}` }));
  db.prepare(entrySel(0) + " WHERE (e.title LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR e.content LIKE ? ESCAPE '\\')" + vis(req) + ' LIMIT 40').all(like, like, like)
    .forEach(e => out.push({ type: 'Entry', title: e.title, icon: e.icon, path: `${e.uname} / ${e.cname}`, href: `#/u/${e.uslug}/${e.cslug}/${e.slug}` }));
  res.json({ results: out }); });

// ---- Voting ----
app.post('/api/entries/:id/vote', needUser, (req, res) => {
  const v = Number(req.body.vote), id = Number(req.params.id);
  if (![1, -1].includes(v)) return bad(res, 'Invalid vote.');
  const e = db.prepare('SELECT status FROM entries WHERE id=?').get(id); if (!e || (e.status !== 'published' && !isW(req))) return bad(res, 'Entry not found.', 404);
  const cur = db.prepare('SELECT vote FROM votes WHERE user_id=? AND entry_id=?').get(req.user.id, id);
  if (cur && cur.vote === v) db.prepare('DELETE FROM votes WHERE user_id=? AND entry_id=?').run(req.user.id, id);
  else db.prepare('INSERT INTO votes(user_id,entry_id,vote) VALUES(?,?,?) ON CONFLICT(user_id,entry_id) DO UPDATE SET vote=excluded.vote').run(req.user.id, id, v);
  const t = db.prepare('SELECT SUM(vote=1) up, SUM(vote=-1) down FROM votes WHERE entry_id=?').get(id);
  res.json({ up: t.up || 0, down: t.down || 0, my_vote: db.prepare('SELECT vote FROM votes WHERE user_id=? AND entry_id=?').get(req.user.id, id)?.vote || 0 }); });

// ---- Writer: create / edit / delete ----
function clean(kind, b) {
  const o = {}; const need = (k, v, msg) => { if (!v) throw new Error(msg); o[k] = v; };
  if (kind === 'universes') { need('name', str(b.name, 80), 'Universe name is required.'); need('slug', str(b.slug, 60).toLowerCase(), 'Slug is required.');
    o.description = str(b.description, 400); o.content = str(b.content, 20000); o.icon = str(b.icon, 40) || 'globe'; o.theme = str(b.theme, 20) || 'meridian'; o.image = str(b.image, 300) || null;
    if (!THEMES.includes(o.theme)) throw new Error('Unknown theme.'); }
  if (kind === 'categories') { o.universe_id = Number(b.universe_id); need('name', str(b.name, 80), 'Category name is required.'); o.slug = str(b.slug, 60).toLowerCase() || o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    o.description = str(b.description, 300); o.icon = str(b.icon, 40) || 'folder'; if (!o.universe_id) throw new Error('Choose a universe.'); }
  if (kind === 'entries') { o.category_id = Number(b.category_id); need('title', str(b.title, 120), 'Entry title is required.'); need('slug', str(b.slug, 60).toLowerCase(), 'Slug is required.');
    o.description = str(b.description, 400); o.content = str(b.content, 200000); o.icon = str(b.icon, 40) || 'file-text'; o.image = str(b.image, 300) || null; o.banner = str(b.banner, 300) || null;
    o.status = b.status === 'draft' ? 'draft' : 'published'; if (!o.category_id) throw new Error('Choose a category.'); }
  if (!SLUG.test(o.slug || '')) throw new Error('Slug may only use lowercase letters, numbers and dashes.');
  if (!ICON.test(o.icon || 'x')) throw new Error('Invalid icon name.');
  for (const k of ['image', 'banner']) if (o[k] && !/^\/uploads\/[a-f0-9]+\.(png|jpg|webp|gif)$/.test(o[k])) throw new Error('Invalid image path.');
  return o; }
for (const kind of ['universes', 'categories', 'entries']) {
  app.post(`/api/${kind}`, needWriter, (req, res) => { try { const o = clean(kind, req.body), k = Object.keys(o);
    const id = db.prepare(`INSERT INTO ${kind}(${k}) VALUES(${k.map(() => '?')})`).run(...k.map(x => o[x])).lastInsertRowid; res.json({ id }); }
    catch (e) { bad(res, /UNIQUE/.test(e.message) ? 'That slug is already used here.' : /FOREIGN/.test(e.message) ? 'Parent not found.' : e.message); } });
  app.put(`/api/${kind}/:id`, needWriter, (req, res) => { try { const o = clean(kind, req.body); if (kind === 'entries') o.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const k = Object.keys(o); const r = db.prepare(`UPDATE ${kind} SET ${k.map(x => x + '=?')} WHERE id=?`).run(...k.map(x => o[x]), Number(req.params.id));
    r.changes ? res.json({ ok: true }) : bad(res, 'Not found.', 404); }
    catch (e) { bad(res, /UNIQUE/.test(e.message) ? 'That slug is already used here.' : e.message); } });
  app.delete(`/api/${kind}/:id`, needWriter, (req, res) => { db.prepare(`DELETE FROM ${kind} WHERE id=?`).run(Number(req.params.id)); res.json({ ok: true }); }); }

// ---- Routing: API never falls through to index.html ----
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => bad(res, 'API route not found.', 404));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err); if (req.path.startsWith('/api')) return bad(res, 'Something went wrong.', 500); res.status(500).send('Something went wrong.'); });
const srv = app.listen(process.env.PORT || 3000, () => console.log(`Nordschliefe's Collection running on http://localhost:${process.env.PORT || 3000}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await drive.flush(); process.exit(0); });
