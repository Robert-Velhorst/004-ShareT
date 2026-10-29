const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

for (const candidate of ['../.env', '../backend/.env', '../.env.docker']) {
  try { process.loadEnvFile?.(path.resolve(__dirname, candidate)); } catch { /* optional */ }
}

const { inspectRuntimeEnvironment } = require('../backend/config/runtime');
const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'support');
fs.mkdirSync(outputDirectory, { recursive: true });

async function readHealth() {
  try {
    const configuredPort = process.env.PORT || '5005';
    if (typeof configuredPort !== 'string' || configuredPort.length > 5 || /[^0-9]/.test(configuredPort)) {
      throw new Error('PORT must be a decimal integer between 1 and 65535');
    }
    const port = Number(configuredPort);
    if (port < 1 || port > 65535) {
      throw new Error('PORT must be a decimal integer between 1 and 65535');
    }
    const healthUrl = new URL('http://127.0.0.1/ready');
    healthUrl.port = String(port);
    const response = await fetch(healthUrl, { redirect: 'error', signal: AbortSignal.timeout(3000) });
    return { reachable: true, status: response.status, body: await response.json() };
  } catch (error) {
    return { reachable: false, error: error.message };
  }
}

async function main() {
  const packageLock = fs.readFileSync(path.join(root, 'package-lock.json'));
  const report = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    node: process.version,
    platform: { platform: process.platform, arch: process.arch },
    runtime: inspectRuntimeEnvironment(),
    health: await readHealth(),
    dependencyLockSha256: crypto.createHash('sha256').update(packageLock).digest('hex'),
    note: 'This bundle contains capability states and diagnostics only; environment values and credentials are excluded.'
  };
  const file = path.join(outputDirectory, `sharet-support-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`Support bundle created: ${file}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
