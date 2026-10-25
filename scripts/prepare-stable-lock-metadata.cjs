'use strict';

// Public metadata only. Existing application cases run in the normal CI jobs.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

if (process.platform !== 'linux' || os.userInfo().uid !== 1000
    || process.env.SHARET_PUBLIC_LOCK_SDK !== 'github-hosted'
    || !['frontend', 'backend'].includes(process.argv[2])) {
  throw new Error('Only the isolated hosted public metadata SDK may run this helper');
}
const scope = process.argv[2];
const inputs = '/inputs';
const output = '/outputs';
const sha = raw => crypto.createHash('sha256').update(raw).digest('hex');
const spec = JSON.parse(fs.readFileSync(path.join(inputs, 'stable-dependency-refresh.json'), 'utf8'));
const receipt = JSON.parse(fs.readFileSync(path.join(inputs, 'source-receipt.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(inputs, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(inputs, 'package-lock.json'), 'utf8'));
if (receipt.scope !== scope || !/^[a-f0-9]{40}$/.test(receipt.source_revision)
    || lock.lockfileVersion !== 3 || spec.npm !== '12.2.1') {
  throw new Error('Unexpected public metadata identity');
}
for (const [name, digest] of Object.entries(receipt.source_metadata_sha256)) {
  if (path.basename(name) !== name || sha(fs.readFileSync(path.join(inputs, name))) !== digest) {
    throw new Error('Source metadata hash changed');
  }
}
function validateRegistryLock(value) {
  for (const item of Object.values(value.packages)) {
    if (item.link) throw new Error('Local dependency links are not public registry metadata');
    if (item.resolved) {
      const url = new URL(item.resolved);
      if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.username || url.password) {
        throw new Error('A locked package leaves the public npm registry');
      }
    }
  }
}
validateRegistryLock(lock);
for (const item of spec.scopes[scope]) {
  if (!['dependencies', 'devDependencies'].includes(item.group)
      || !/^\d+\.\d+\.\d+$/.test(item.target) || item.to !== '^' + item.target
      || ![item.from, item.to].includes(manifest[item.group]?.[item.name])) {
    throw new Error('Unexpected stable dependency update');
  }
  manifest[item.group][item.name] = item.to;
}
fs.mkdirSync('/tmp/home', { recursive: true });
fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.copyFileSync(path.join(inputs, 'package-lock.json'), path.join(output, 'package-lock.json'));
Object.assign(receipt, { requested_updates: spec.scopes[scope], commands: [],
  application_source_or_credentials_mounted: false, lifecycle_scripts_enabled: false,
  dependency_or_peer_constraints_bypassed: false, direct_targets_and_integrities_verified: false,
  public_lock_audit_clean: false, application_or_runtime_acceptance: false });
const environment = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp/home',
  npm_config_cache: '/tmp/npm-cache', npm_config_engine_strict: 'true',
  npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'true',
  CI: 'true', LANG: 'C.UTF-8' };
function run(name, args, allowFailure = false) {
  const result = spawnSync('/usr/local/bin/npm', args, { cwd: output, env: environment,
    encoding: 'utf8', timeout: 480000, maxBuffer: 8 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, name + '.stdout'), result.stdout || '');
  fs.writeFileSync(path.join(output, name + '.stderr'), result.stderr || '');
  receipt.commands.push({ name, argv: args, status: result.status,
    error: result.error ? result.error.message : null });
  if (result.error || (!allowFailure && result.status !== 0)) throw new Error(name + ' failed under normal npm policy');
  return result;
}
try {
  const version = run('npm-version', ['--version']).stdout.trim();
  if (version !== spec.npm || process.versions.node !== '26.12.1') throw new Error('Unexpected SDK tools');
  receipt.node = process.versions.node;
  receipt.npm = version;
  run('public-lock-refresh', ['update', '--package-lock-only', '--ignore-scripts', '--no-audit']);
  const generated = JSON.parse(fs.readFileSync(path.join(output, 'package-lock.json'), 'utf8'));
  validateRegistryLock(generated);
  for (const item of spec.direct_targets[scope]) {
    const selected = generated.packages['node_modules/' + item.name];
    if (selected?.version !== item.target || selected.integrity !== item.publisher_integrity) {
      throw new Error('Generated direct target differs from the reviewed publisher release');
    }
  }
  receipt.reviewed_direct_targets = spec.direct_targets[scope];
  receipt.resolved_security_packages = Object.fromEntries(spec.known_security_packages.map(name =>
    [name, Object.entries(generated.packages).filter(([location]) => location.endsWith('node_modules/' + name))
      .map(([location, item]) => ({ location, version: item.version, integrity: item.integrity }))]));
  receipt.direct_targets_and_integrities_verified = true;
  const audit = run('public-lock-audit', ['audit', '--package-lock-only', '--json'], true);
  const report = JSON.parse(audit.stdout);
  receipt.audit_vulnerabilities = report.metadata?.vulnerabilities;
  if (audit.status !== 0 || receipt.audit_vulnerabilities?.total !== 0) {
    throw new Error('The full generated graph still has reported advisories');
  }
  receipt.public_lock_audit_clean = true;
} finally {
  receipt.generated_metadata_sha256 = {};
  for (const name of fs.readdirSync(output)) {
    const file = path.join(output, name);
    if (fs.statSync(file).isFile() && name !== 'receipt.json') {
      receipt.generated_metadata_sha256[name] = sha(fs.readFileSync(file));
    }
  }
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
}
