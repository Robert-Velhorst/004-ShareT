const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

for (const candidate of ['../.env', '../backend/.env']) {
  try { process.loadEnvFile?.(path.resolve(__dirname, candidate)); } catch { /* optional */ }
}

const root = path.resolve(__dirname, '..');
const source = path.resolve(root, process.env.DATA_DIR || 'backend/data');
const destinationRoot = path.resolve(root, process.argv[2] || 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(destinationRoot, `sharet-${stamp}`);

if (!fs.existsSync(source)) throw new Error(`Data directory does not exist: ${source}`);
fs.mkdirSync(destinationRoot, { recursive: true });
fs.cpSync(source, path.join(destination, 'data'), { recursive: true, errorOnExist: true });

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else {
      const bytes = fs.readFileSync(absolute);
      files.push({
        path: path.relative(destination, absolute).replace(/\\/g, '/'),
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex')
      });
    }
  }
}
walk(path.join(destination, 'data'));
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  source,
  files
}, null, 2));
console.log(`Backup created: ${destination}`);
console.log(`Files: ${files.length}`);
