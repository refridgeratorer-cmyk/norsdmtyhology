// Google Drive backup/restore. Drive holds the permanent copy; the server works from local disk.
// Needs env vars GDRIVE_KEY (service account JSON) and GDRIVE_FOLDER_ID. If missing, this does nothing.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FOLDER = (process.env.GDRIVE_FOLDER_ID || '').trim();
let KEY = null;
try { const raw = (process.env.GDRIVE_KEY || '').trim(); if (raw) KEY = JSON.parse(raw[0] === '{' ? raw : Buffer.from(raw, 'base64').toString()); }
catch { console.error('GDRIVE_KEY is not valid JSON. Paste the whole key file contents.'); }
const enabled = !!(KEY && FOLDER);
const IMG = /^[a-f0-9]+\.(png|jpg|webp|gif)$/, MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
let token = null, tokenExp = 0, remote = new Map(), ctx = null, timer = null, busy = false, dirty = false;

async function auth() {
  if (token && Date.now() < tokenExp) return token;
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), iat = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 });
  const jwt = head + '.' + crypto.createSign('RSA-SHA256').update(head).sign(KEY.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const j = await r.json(); if (!r.ok) throw new Error('Google login failed: ' + (j.error_description || j.error));
  token = j.access_token; tokenExp = Date.now() + 50 * 60 * 1000; return token; }
async function g(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + await auth(), ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 300)}`); return r; }
async function list() {
  const out = new Map(); let page = '';
  do { const q = encodeURIComponent(`'${FOLDER}' in parents and trashed=false`);
    const j = await (await g(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${page}`)).json();
    j.files.forEach(f => out.set(f.name, f.id)); page = j.nextPageToken ? '&pageToken=' + j.nextPageToken : ''; } while (page);
  return out; }
async function put(name, buf, mime) {
  const id = remote.get(name), B = 'nsc' + crypto.randomBytes(8).toString('hex'), meta = id ? {} : { name, parents: [FOLDER] };
  const body = Buffer.concat([Buffer.from(`--${B}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${B}\r\nContent-Type: ${mime}\r\n\r\n`), buf, Buffer.from(`\r\n--${B}--`)]);
  const url = id ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart&supportsAllDrives=true` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true';
  const j = await (await g(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${B}` }, body })).json(); remote.set(name, j.id || id); }

// Runs BEFORE the server starts. Throws on failure so we never overwrite good Drive data with a blank database.
async function restore(dataDir, uploadDir) {
  if (!enabled) return console.log('Drive sync: off (GDRIVE_KEY / GDRIVE_FOLDER_ID not set).');
  fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(uploadDir, { recursive: true });
  remote = await list(); const dbPath = path.join(dataDir, 'collection.db'); let n = 0;
  if (remote.has('collection.db') && !fs.existsSync(dbPath)) { fs.writeFileSync(dbPath, Buffer.from(await (await g(`https://www.googleapis.com/drive/v3/files/${remote.get('collection.db')}?alt=media&supportsAllDrives=true`)).arrayBuffer())); console.log('Drive sync: database restored.'); }
  for (const [name, id] of remote) if (IMG.test(name) && !fs.existsSync(path.join(uploadDir, name))) { fs.writeFileSync(path.join(uploadDir, name), Buffer.from(await (await g(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`)).arrayBuffer())); n++; }
  console.log(`Drive sync: on. ${n} image(s) restored.`); }

function init(c) { ctx = c; }
async function sync() {
  if (busy) { dirty = true; return; } busy = true;
  try { do { dirty = false; const tmp = path.join(ctx.dataDir, 'snapshot.tmp'); await ctx.db.backup(tmp);
      await put('collection.db', fs.readFileSync(tmp), 'application/octet-stream'); fs.unlinkSync(tmp);
      for (const f of fs.readdirSync(ctx.uploadDir)) if (IMG.test(f) && !remote.has(f)) await put(f, fs.readFileSync(path.join(ctx.uploadDir, f)), MIME[f.split('.')[1]]);
      console.log('Drive sync: saved.'); } while (dirty); }
  catch (e) { console.error('Drive sync FAILED (will retry on next change):', e.message); } finally { busy = false; } }
function schedule() { if (!enabled || !ctx) return; clearTimeout(timer); timer = setTimeout(sync, 4000); }
async function flush() { if (!enabled || !ctx) return; clearTimeout(timer); await sync(); }
module.exports = { enabled, restore, init, schedule, flush };
