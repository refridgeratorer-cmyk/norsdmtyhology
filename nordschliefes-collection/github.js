// GitHub backup/restore. A private GitHub repo holds the permanent copy; the server works from local disk.
// Needs env vars GITHUB_TOKEN and GITHUB_BACKUP_REPO (like "yourname/collection-data"). If missing, this does nothing.
const fs = require('fs'), path = require('path');
const TOKEN = (process.env.GITHUB_TOKEN || '').trim(), REPO = (process.env.GITHUB_BACKUP_REPO || '').trim(), BRANCH = (process.env.GITHUB_BACKUP_BRANCH || 'main').trim();
const enabled = !!(TOKEN && /^[\w.-]+\/[\w.-]+$/.test(REPO));
const IMG = /^[a-f0-9]+\.(png|jpg|webp|gif)$/;
let ctx = null, timer = null, busy = false, dirty = false; const shas = new Map();

async function gh(url, opt = {}) {
  const r = await fetch('https://api.github.com/repos/' + REPO + url, { ...opt, headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nordschliefes-collection', ...(opt.headers || {}) } });
  if (!r.ok && r.status !== 404 && r.status !== 409 && r.status !== 422) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r; }
const cpath = p => '/contents' + (p ? '/' + p : '') + '?ref=' + BRANCH;
async function list(dir) { const r = await gh(cpath(dir)); if (r.status === 404) return []; const j = await r.json(); return Array.isArray(j) ? j.filter(f => f.type === 'file') : []; }
async function download(p) { const r = await gh(cpath(p), { headers: { Accept: 'application/vnd.github.raw+json' } }); if (!r.ok) throw new Error('GitHub could not download ' + p); return Buffer.from(await r.arrayBuffer()); }
async function put(p, buf, retry = true) {
  const body = { message: 'backup ' + new Date().toISOString(), content: buf.toString('base64'), branch: BRANCH }; if (shas.has(p)) body.sha = shas.get(p);
  const r = await gh('/contents/' + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.ok) return shas.set(p, (await r.json()).content.sha);
  if (!retry) throw new Error(`GitHub refused ${p} (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const cur = await gh(cpath(p)); if (cur.ok) shas.set(p, (await cur.json()).sha); else shas.delete(p); // sha was stale: refresh and retry once
  return put(p, buf, false); }

// Runs BEFORE the server starts. Throws on failure so a blank database never overwrites a good backup.
async function restore(dataDir, uploadDir) {
  if (!enabled) return console.log('GitHub backup: off (GITHUB_TOKEN / GITHUB_BACKUP_REPO not set).');
  fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(uploadDir, { recursive: true });
  const rr = await gh(''); if (!rr.ok) throw new Error('Cannot open the backup repo. Check GITHUB_BACKUP_REPO and that the token can access it.');
  const dbPath = path.join(dataDir, 'collection.db'); let n = 0;
  const root = await list(''), db = root.find(f => f.name === 'collection.db');
  if (db) { shas.set('collection.db', db.sha); if (!fs.existsSync(dbPath)) { fs.writeFileSync(dbPath, await download('collection.db')); console.log('GitHub backup: database restored.'); } }
  for (const f of await list('uploads')) if (IMG.test(f.name)) { shas.set('uploads/' + f.name, f.sha); const lp = path.join(uploadDir, f.name); if (!fs.existsSync(lp)) { fs.writeFileSync(lp, await download('uploads/' + f.name)); n++; } }
  console.log(`GitHub backup: on. ${n} image(s) restored.`); }

function init(c) { ctx = c; }
async function sync() {
  if (busy) { dirty = true; return; } busy = true;
  try { do { dirty = false; const tmp = path.join(ctx.dataDir, 'snapshot.tmp'); await ctx.db.backup(tmp);
      await put('collection.db', fs.readFileSync(tmp)); fs.unlinkSync(tmp);
      for (const f of fs.readdirSync(ctx.uploadDir)) if (IMG.test(f) && !shas.has('uploads/' + f)) await put('uploads/' + f, fs.readFileSync(path.join(ctx.uploadDir, f)));
      console.log('GitHub backup: saved.'); } while (dirty); }
  catch (e) { console.error('GitHub backup FAILED (will retry on next change):', e.message); } finally { busy = false; } }
function schedule() { if (!enabled || !ctx) return; clearTimeout(timer); timer = setTimeout(sync, 4000); }
async function flush() { if (!enabled || !ctx) return; clearTimeout(timer); await sync(); }
module.exports = { enabled, restore, init, schedule, flush };
