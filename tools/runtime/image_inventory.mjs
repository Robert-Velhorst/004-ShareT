// Metadata only: do not import application or third-party package code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifests = [];
const fileErrors = [];
const buildToolPaths = [
  '/usr/local/bin/npm', '/usr/local/bin/npx', '/usr/local/bin/yarn',
  '/usr/local/bin/yarnpkg', '/usr/local/bin/corepack',
  '/usr/local/lib/node_modules/npm',
];
const buildToolsPresent = buildToolPaths.filter(name => {
  try { fs.lstatSync(name); return true; } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
});
function walk(folder) {
  if (!fs.existsSync(folder)) return;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const name = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(name);
    else if (entry.isFile() && entry.name === 'package.json') {
      const bytes = fs.readFileSync(name);
      try {
        const data = JSON.parse(bytes);
        manifests.push({ path: name, name: data.name ?? null, version: data.version ?? null, sha256: hash(bytes) });
      } catch {
        fileErrors.push({ path: name, sha256: hash(bytes), error: 'invalid_json_manifest' });
      }
    }
  }
}
for (const folder of ['/app/backend/node_modules', '/usr/local/lib/node_modules', '/opt']) walk(folder);
const cases = {};
for (const entry of fs.readdirSync('/app/backend/test', { withFileTypes: true })) {
  if (entry.isFile()) {
    const file = path.join('/app/backend/test', entry.name);
    cases[`backend/test/${entry.name}`] = hash(fs.readFileSync(file));
  }
}
process.stdout.write(`${JSON.stringify({
  node: process.version, components: process.versions, uid: process.getuid(), gid: process.getgid(),
  node_executable_sha256: hash(fs.readFileSync(process.execPath)),
  architecture: process.arch, platform: process.platform,
  backend_manifest_sha256: hash(fs.readFileSync('/app/backend/package.json')),
  backend_lock_sha256: hash(fs.readFileSync('/app/backend/package-lock.json')),
  manifests, fileErrors, original_case_sha256: cases, buildToolsPresent,
  application_or_package_code_imported: false,
})}\n`);
