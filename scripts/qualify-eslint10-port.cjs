'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const phase = process.argv[2];
if (process.platform !== 'linux' || os.userInfo().uid !== 1000
    || process.versions.node !== '26.12.1'
    || process.env.SHARET_ESLINT10_CASE_SDK !== 'github-hosted'
    || !['install', 'test'].includes(phase)) {
  throw new Error('Use the disposable hosted public-source SDK');
}
const input = '/inputs';
const output = '/outputs';
const source = '/build/package';
const digest = raw => crypto.createHash('sha256').update(raw).digest('hex');
const spec = JSON.parse(fs.readFileSync(path.join(input, 'provenance.json'), 'utf8'));
const report = { phase, node: process.versions.node, commands: [],
  original_unit_test_script: spec.original_unit_test_script,
  original_case_and_helper_files_unchanged: false,
  normal_dependency_graph_qualified: false, original_unit_command_executed: false,
  original_unit_command_passed: false, full_all_parser_platform_or_application_acceptance: false,
  application_source_or_credentials_mounted: false,
  dependency_engine_peer_or_case_checks_bypassed: false };
const environment = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp/home',
  npm_config_cache: '/tmp/npm-cache', npm_config_registry: 'https://registry.npmjs.org/',
  npm_config_engine_strict: 'true', npm_config_strict_peer_deps: 'true',
  npm_config_legacy_peer_deps: 'false', npm_config_force: 'false',
  npm_config_ignore_scripts: 'true', CI: 'true', LANG: 'C.UTF-8' };
fs.mkdirSync('/tmp/home', { recursive: true });

function run(name, executable, args, cwd, timeout) {
  const logfile = path.join(output, phase + '-' + name + '.log');
  const handle = fs.openSync(logfile, 'w');
  let result;
  try {
    result = spawnSync(executable, args, { cwd, env: environment, timeout,
      stdio: ['ignore', handle, handle] });
  } finally {
    fs.closeSync(handle);
  }
  report.commands.push({ name, executable, argv: args, status: result?.status,
    error: result?.error ? result.error.message : null,
    log_sha256: digest(fs.readFileSync(logfile)) });
  if (result?.error || result?.status !== 0) throw new Error(name + ' failed; keep normal diagnostics');
  return fs.readFileSync(logfile, 'utf8');
}
function verifyCases() {
  for (const [name, hash] of Object.entries(spec.original_case_and_helper_file_sha256)) {
    const candidate = path.resolve(source, name);
    if (!candidate.startsWith(source + '/tests/') || digest(fs.readFileSync(candidate)) !== hash) {
      throw new Error('An original case or helper differs');
    }
  }
  for (const [name, hash] of Object.entries(spec.candidate_library_JS_sha256)) {
    const candidate = path.resolve(source, name);
    if (!candidate.startsWith(source + '/lib/') || digest(fs.readFileSync(candidate)) !== hash) {
      throw new Error('Tested library differs from the candidate archive');
    }
  }
  report.original_case_and_helper_files_unchanged = true;
  report.protected_case_helper_files = Object.keys(spec.original_case_and_helper_file_sha256).length;
}
try {
  for (const item of [spec.candidate_archive, spec.unit_source_archive]) {
    if (path.basename(item.file) !== item.file) throw new Error('Unexpected public input filename');
    const raw = fs.readFileSync(path.join(input, item.file));
    if (raw.length !== item.bytes || digest(raw) !== item.sha256) throw new Error('Public source archive changed');
  }
  report.candidate_archive_sha256 = spec.candidate_archive.sha256;
  report.unit_source_archive_sha256 = spec.unit_source_archive.sha256;
  const npm = run('npm-version', '/usr/local/bin/npm', ['--version'], '/build', 30000).trim();
  if (npm !== '12.2.1') throw new Error('Unexpected package manager');
  report.npm = npm;
  if (phase === 'install') {
    const entries = run('archive-paths', '/bin/tar', ['-tzf', path.join(input, spec.unit_source_archive.file)], '/build', 30000);
    if (entries.trim().split('\n').some(name => !name.startsWith('package/') || name.split('/').includes('..'))) {
      throw new Error('Source archive escapes its public working directory');
    }
    run('source-extraction', '/bin/tar', ['-xzf', path.join(input, spec.unit_source_archive.file), '-C', '/build'], '/build', 30000);
  }
  verifyCases();
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  if (manifest.version !== spec.version || manifest.scripts['unit-test'] !== spec.original_unit_test_script
      || JSON.stringify(manifest.dependencies) !== JSON.stringify(spec.production_runtime_dependency_targets)
      || JSON.stringify(manifest.devDependencies) !== JSON.stringify(spec.unit_sdk_dependency_targets)) {
    throw new Error('Published unit entry or reviewed SDK dependency targets changed');
  }
  if (phase === 'install') {
    run('normal-dependency-install', '/usr/local/bin/npm', ['install', '--ignore-scripts', '--no-audit'], source, 480000);
    const lock = JSON.parse(fs.readFileSync(path.join(source, 'package-lock.json'), 'utf8'));
    for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
      const actual = JSON.parse(fs.readFileSync(path.join(source, 'node_modules', name, 'package.json'), 'utf8'));
      if (actual.version !== version) throw new Error('Installed SDK selection differs from its reviewed target');
      if (lock.packages['node_modules/' + name]?.integrity !== spec.dependency_publisher_metadata[name].dist.integrity) {
        throw new Error('Installed direct dependency differs from inspected publisher integrity');
      }
    }
    report.normal_dependency_graph_qualified = true;
  } else {
    const installed = JSON.parse(fs.readFileSync(path.join(output, 'install-receipt.json'), 'utf8'));
    if (!installed.normal_dependency_graph_qualified
        || installed.unit_source_archive_sha256 !== report.unit_source_archive_sha256
        || installed.candidate_archive_sha256 !== report.candidate_archive_sha256) {
      throw new Error('Require the exact normally installed source SDK first');
    }
    report.normal_dependency_graph_qualified = true;
    report.original_unit_command_executed = true;
    const log = run('all-original-unit-cases', '/usr/local/bin/npm', ['run', 'unit-test', '--ignore-scripts'], source, 900000);
    const passing = [...log.matchAll(/(\d+) passing\b/g)];
    if (!passing.length || Number(passing.at(-1)[1]) < 1) throw new Error('No original unit summary was produced');
    report.passing_cases = Number(passing.at(-1)[1]);
    report.pending_case_markers = [...log.matchAll(/(\d+) pending\b/g)].map(match => Number(match[1]));
    report.original_unit_command_passed = true;
  }
} finally {
  let protectedFileError;
  if (fs.existsSync(path.join(source, 'tests'))) {
    try { verifyCases(); } catch (error) {
      report.original_case_and_helper_files_unchanged = false;
      report.protected_file_error = error.message;
      protectedFileError = error;
    }
  }
  if (fs.existsSync(path.join(source, 'package-lock.json'))) {
    fs.copyFileSync(path.join(source, 'package-lock.json'), path.join(output, phase + '-package-lock.json'));
  }
  fs.writeFileSync(path.join(output, phase + '-receipt.json'), JSON.stringify(report, null, 2) + '\n');
  if (protectedFileError) throw protectedFileError;
}
