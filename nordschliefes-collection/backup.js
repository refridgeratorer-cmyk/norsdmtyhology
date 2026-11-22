// Picks the backup method: GitHub if configured, otherwise Google Drive (which does nothing if not configured).
const gh = require('./github');
module.exports = gh.enabled ? gh : require('./drive');
