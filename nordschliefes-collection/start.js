// Start here: restores data from Google Drive (if configured), then launches the server.
const fs = require('fs'), path = require('path');
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }); } catch {}
require('./drive').restore(process.env.DATA_DIR || path.join(__dirname, 'data'), process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'))
  .then(() => require('./server'))
  .catch(e => { console.error('Startup stopped so your Drive backup is not overwritten:', e.message); process.exit(1); });
