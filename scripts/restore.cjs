const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

for (const candidate of ['../.env', '../backend/.env']) {
  try { process.loadEnvFile?.(path.resolve(__dirname, candidate)); } catch { /* optional */ }
}

const backup = process.argv[2] && path.resolve(process.argv[2]);
if (!backup || !process.argv.includes('--confirm')) {
  throw new Error('Usage: npm run restore -- <backup-directory> --confirm (stop ShareT first)');
}

const manifestPath = path.join(backup, 'manifest.json');
const backupData = path.join(backup, 'data');
if (!fs.existsSync(manifestPath) || !fs.existsSync(backupData)) throw new Error('Invalid ShareT backup directory');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const file of manifest.files || []) {
  const absolute = path.resolve(backup, file.path);
  if (!absolute.startsWith(`${backup}${path.sep}`)) throw new Error(`Unsafe manifest path: ${file.path}`);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  if (digest !== file.sha256) throw new Error(`Backup integrity check failed: ${file.path}`);
}

const root = path.resolve(__dirname, '..');
const destination = path.resolve(root, process.env.DATA_DIR || 'backend/data');
const safetyCopy = `${destination}.before-restore-${Date.now()}`;
if (fs.existsSync(destination)) fs.renameSync(destination, safetyCopy);
try {
  fs.cpSync(backupData, destination, { recursive: true, errorOnExist: true });
} catch (error) {
  if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
  if (fs.existsSync(safetyCopy)) fs.renameSync(safetyCopy, destination);
  throw error;
}
console.log(`Restore completed: ${destination}`);
if (fs.existsSync(safetyCopy)) console.log(`Previous data retained at: ${safetyCopy}`);
