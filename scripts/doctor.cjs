const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

try {
  process.loadEnvFile?.(path.resolve(__dirname, '../.env'));
} catch {
  // The backend-specific file may still be available.
}
try {
  process.loadEnvFile?.(path.resolve(__dirname, '../backend/.env'));
} catch {
  // Missing configuration is reported below without printing any values.
}

const { inspectRuntimeEnvironment } = require('../backend/config/runtime');

function checkWritableDirectory(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const root = path.resolve(__dirname, '..');
const dataDirectory = path.resolve(root, process.env.DATA_DIR || 'backend/data');
const runtime = inspectRuntimeEnvironment();
const nodeMajor = Number(process.versions.node.split('.')[0]);
const writable = checkWritableDirectory(dataDirectory);

const report = {
  ok: runtime.ok && nodeMajor >= 22 && writable,
  node: { version: process.versions.node, supported: nodeMajor >= 22 },
  filesystem: {
    dataDirectory,
    dataDirectoryWritable: writable,
    frontendBuildPresent: fs.existsSync(path.join(root, 'backend/frontend/dist/index.html'))
  },
  runtime,
  platform: { type: os.type(), release: os.release(), arch: os.arch() }
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`ShareT doctor: ${report.ok ? 'PASS' : 'ATTENTION REQUIRED'}`);
  console.log(`Node ${report.node.version}: ${report.node.supported ? 'supported' : 'Node 22+ required'}`);
  console.log(`Data directory: ${report.filesystem.dataDirectoryWritable ? 'writable' : 'not writable'}`);
  console.log(`Frontend build: ${report.filesystem.frontendBuildPresent ? 'present' : 'missing (run npm run build:serve)'}`);
  for (const error of runtime.errors) console.error(`Error: ${error}`);
  for (const warning of runtime.warnings) console.warn(`Warning: ${warning}`);
}

process.exitCode = report.ok ? 0 : 1;
