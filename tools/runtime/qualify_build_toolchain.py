"""Inspect/test the real build toolchain only on disposable hosted workers."""
from pathlib import Path
import hashlib, json, os, subprocess, sys

if sys.platform != 'linux' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
    raise RuntimeError('Use a disposable GitHub-hosted Linux worker')

mode = sys.argv[1]
assert mode in {'inventory', 'cases', 'scan'}
folder = Path(os.environ['RUNNER_TEMP']) / 'sharet-build-toolchain/reports'
folder.mkdir(parents=True, exist_ok=True)
image = 'sharet-build-toolchain:ci'
common = ['docker', 'run', '--rm', '--network', 'none', '--read-only', '--user', '10001:10001',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '1g', '--cpus', '1.5',
    '--pids-limit', '256', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777',
    '--tmpfs', '/app/backend/data:rw,noexec,nosuid,nodev,size=128m,mode=1777',
    '--tmpfs', '/app/node_modules/.vite:rw,noexec,nosuid,nodev,size=128m,mode=1777',
    '--tmpfs', '/app/node_modules/.vite-temp:rw,noexec,nosuid,nodev,size=128m,mode=1777', '-e', 'HOME=/tmp']

if mode == 'inventory':
    script = str(Path('tools/runtime/image_inventory.mjs').resolve())
    raw = subprocess.check_output([*common, '--mount', 'type=bind,src=' + script + ',dst=/ci/inventory.mjs,readonly', image, 'node', '/ci/inventory.mjs'])
    (folder / 'installed-metadata.json').write_bytes(raw)
    data = json.loads(raw)
    assert data['node'] == 'v26.12.1' and data['uid'] == data['gid'] == 10001
    sha = lambda raw: hashlib.sha256(raw).hexdigest()
    assert data['backend_manifest_sha256'] == sha(Path('backend/package.json').read_bytes())
    assert data['backend_lock_sha256'] == sha(Path('backend/package-lock.json').read_bytes())
    assert data['frontend_manifest_sha256'] == sha(Path('package.json').read_bytes())
    assert data['frontend_lock_sha256'] == sha(Path('package-lock.json').read_bytes())
    cases = {str(p).replace('\\', '/'): sha(p.read_bytes()) for p in Path('backend/test').glob('*') if p.is_file()}
    assert data['original_case_sha256'] == cases
    npm = [entry for entry in data['manifests'] if entry['path'] == '/usr/local/lib/node_modules/npm/package.json']
    assert len(npm) == 1 and npm[0]['name'] == 'npm' and npm[0]['version'] == '12.2.1'
    manifest = json.loads(Path('backend/package.json').read_text())
    lock = json.loads(Path('backend/package-lock.json').read_text())['packages']
    installed = {entry['path']: entry for entry in data['manifests']}
    for name in manifest['dependencies']:
        key = 'node_modules/' + name
        assert installed['/app/backend/' + key + '/package.json']['version'] == lock[key]['version']
    frontend = json.loads(Path('package.json').read_text())
    frontend_lock = json.loads(Path('package-lock.json').read_text())['packages']
    for name in {**frontend['dependencies'], **frontend['devDependencies']}:
        key = 'node_modules/' + name
        assert installed['/app/' + key + '/package.json']['version'] == frontend_lock[key]['version']
    version = subprocess.check_output([*common, image, 'npm', '--version'], text=True).strip()
    (folder / 'actual-npm-version.txt').write_text(version + '\n')
    assert version == '12.2.1'
    (folder / 'inventory-summary.json').write_text(json.dumps({
        'actual_npm': version, 'original_case_files_verified': len(cases),
        'all_manifest_records_retained': len(data['manifests']),
        'direct_backend_locked_versions_verified': len(manifest['dependencies']),
        'direct_frontend_locked_versions_verified': len({**frontend['dependencies'], **frontend['devDependencies']}),
        'every_build_dependency_current_or_advisory_free': False}, indent=2) + '\n')
elif mode == 'cases':
    fixtures = {'NODE_ENV': 'test',
        'JWT_SECRET': 'ci-jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
        'JWT_REFRESH_SECRET': 'ci-refresh-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
        'SESSION_SECRET': 'ci-session-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
        'ENCRYPTION_KEY': 'ci-encryption-secret-0123456789-abcdefghijklmnopqrstuvwxyz'}
    environment = [part for key, value in fixtures.items() for part in ['-e', key + '=' + value]]
    commands = [
        ('backend-cases', '/app/backend', ['npm', 'test']),
        ('lint', '/app', ['npm', 'run', 'lint']),
        ('homepage', '/app', ['npm', 'run', 'test:homepage']),
        ('billing-ui', '/app', ['npm', 'run', 'test:billing-ui']),
        ('informational-pages', '/app', ['node', '--test', 'test/informational-pages.test.mjs']),
    ]
    outcomes = []
    for name, workdir, command in commands:
        with (folder / ('original-npm12-' + name + '.log')).open('wb') as out:
            result = subprocess.run([*common, *environment, '--workdir', workdir, image, *command],
                stdout=out, stderr=subprocess.STDOUT, timeout=600)
        outcomes.append({'original_command': command, 'working_directory': workdir,
            'returncode': result.returncode, 'unmodified_raw_log': 'original-npm12-' + name + '.log'})
    (folder / 'original-command-results.json').write_text(json.dumps(outcomes, indent=2) + '\n')
    assert all(row['returncode'] == 0 for row in outcomes), 'An original command failed; all raw outcomes retained'
else:
    report = json.loads((folder / 'image-security.json').read_text())
    identity = json.loads((folder / 'image-identity.json').read_text())
    assert report['SchemaVersion'] == 2 and report['ArtifactType'] == 'container_image'
    assert report['Metadata']['ImageID'] == identity['config_id'] and identity['verified_descriptor_chain']
    assert not report['Metadata']['OS'].get('EOSL', False)
    rows = report['Results']
    assert any(row.get('Class') == 'os-pkgs' and row.get('Packages') for row in rows)
    assert any(row.get('Type') == 'node-pkg' and row.get('Packages') for row in rows)
    findings = [finding for row in rows for key in ['Vulnerabilities', 'ExperimentalModifiedFindings'] for finding in row.get(key) or []]
    (folder / 'image-security-summary.json').write_text(json.dumps({
        'config_id': identity['config_id'], 'all_raw_or_modified_findings': len(findings),
        'complete_report_and_all_package_inventory_retained': True,
        'all_severities_required': True, 'advisory_or_source_exclusions': False,
        'all_components_latest_stable_qualified': False, 'deployment_acceptance': False}, indent=2) + '\n')
    assert not findings, 'Build-toolchain findings remain; no waiver or severity exclusion is applied'
