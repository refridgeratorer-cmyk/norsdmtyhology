// Picks the backup method: GitHub if configured, otherwise Google Drive (which does nothing if not configured).
const gh = require('./github');
if (!gh.enabled && (process.env.GITHUB_TOKEN || process.env.GITHUB_BACKUP_REPO))
  console.warn('GitHub backup NOT used: need BOTH GITHUB_TOKEN and GITHUB_BACKUP_REPO, and the repo must look like "yourname/collection-data" (no https://, no spaces).');
module.exports = gh.enabled ? gh : require('./drive');
