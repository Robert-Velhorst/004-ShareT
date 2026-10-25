"""Run existing image commands only inside a disposable GitHub-hosted worker."""
from pathlib import Path
import os, sys, subprocess, json, time, hashlib, re

if sys.platform != 'linux' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
    raise RuntimeError('Use the disposable GitHub-hosted Linux qualification worker')

mode = sys.argv[1]
assert mode in {'inventory', 'cases', 'startup', 'scan'}
image = 'sharet-runtime:ci'
folder = Path(os.environ['RUNNER_TEMP']) / 'sharet-runtime-image/reports'
folder.mkdir(parents=True, exist_ok=True)
common = ['docker', 'run', '--network', 'none', '--read-only', '--user', '10001:10001',
          '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '1g',
          '--cpus', '1.5', '--pids-limit', '256', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777',
          '--tmpfs', '/app/backend/data:rw,noexec,nosuid,nodev,size=128m,mode=1777', '-e', 'HOME=/tmp']
fixtures = {'JWT_SECRET': 'ci-jwt-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
            'JWT_REFRESH_SECRET': 'ci-refresh-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
            'SESSION_SECRET': 'ci-session-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
            'ENCRYPTION_KEY': 'ci-encryption-secret-0123456789-abcdefghijklmnopqrstuvwxyz'}

def environment(values):
    return [argument for key, value in values.items() for argument in ['-e', key + '=' + value]]

def invoke(arguments, name, timeout=300):
    with (folder / name).open('wb') as output:
        result = subprocess.run(arguments, stdout=output, stderr=subprocess.STDOUT, timeout=timeout)
    if result.returncode:
        raise RuntimeError(name + ' failed; inspect the retained unmodified command output')

if mode == 'inventory':
    # These are direct interpreter/package-file metadata reads, not imports.
    script = str(Path('tools/runtime/image_inventory.mjs').resolve())
    raw = subprocess.check_output([*common, '--rm', '--mount',
        'type=bind,src=' + script + ',dst=/ci/image_inventory.mjs,readonly', image, 'node', '/ci/image_inventory.mjs'])
    (folder / 'installed-metadata.json').write_bytes(raw)
    data = json.loads(raw)
    assert data['node'] == 'v26.12.1' and data['uid'] == data['gid'] == 10001
    assert data['buildToolsPresent'] == [], 'Build package managers must be absent from the production image'
    assert all(entry['path'].startswith('/app/backend/') for entry in data['manifests'])
    source_image = 'node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797'
    metadata_command = ("const fs=require('node:fs'),crypto=require('node:crypto');"
        "process.stdout.write(JSON.stringify({components:process.versions,node_executable_sha256:"
        "crypto.createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex')}))")
    source_raw = subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--read-only',
        '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--memory', '512m', '--cpus', '1', '--pids-limit', '64', source_image, 'node', '-e', metadata_command])
    (folder / 'official-source-node-metadata.json').write_bytes(source_raw)
    source_node = json.loads(source_raw)
    assert data['node_executable_sha256'] == source_node['node_executable_sha256']
    assert data['components'] == source_node['components']
    sha = lambda raw: hashlib.sha256(raw).hexdigest()
    assert data['backend_manifest_sha256'] == sha(Path('backend/package.json').read_bytes())
    assert data['backend_lock_sha256'] == sha(Path('backend/package-lock.json').read_bytes())
    expected_cases = {str(path).replace('\\', '/'): sha(path.read_bytes()) for path in Path('backend/test').glob('*') if path.is_file()}
    assert data['original_case_sha256'] == expected_cases
    manifest = json.loads(Path('backend/package.json').read_text())
    lock = json.loads(Path('backend/package-lock.json').read_text())['packages']
    actual = {entry['path'].removeprefix('/app/backend/'): entry for entry in data['manifests']
              if entry['path'].startswith('/app/backend/')}
    for name in manifest['dependencies']:
        key = 'node_modules/' + name
        assert actual[key + '/package.json']['name'] == name
        assert actual[key + '/package.json']['version'] == lock[key]['version']
    (folder / 'installed-metadata-summary.json').write_text(json.dumps({
        'original_case_files_verified': len(expected_cases), 'direct_backend_versions_verified': len(manifest['dependencies']),
        'all_manifest_records_retained': len(data['manifests']), 'manifest_parse_diagnostics_retained': data['fileErrors'],
        'all_components_current': False, 'live_provider_or_operator_data_acceptance': False}, indent=2) + '\n')
elif mode == 'cases':
    # npm is a build-stage tool. Execute the exact unchanged declared command in
    # the production image, with every original case and no extra lifecycle step.
    manifest = json.loads(Path('backend/package.json').read_text())
    scripts = manifest['scripts']
    assert scripts['test'] == 'node --test test/*.test.js'
    assert 'pretest' not in scripts and 'posttest' not in scripts
    (folder / 'original-image-case-command.json').write_text(json.dumps({
        'declared_original_script': scripts['test'], 'launcher': ['/bin/sh', '-c'],
        'pretest_or_posttest_declared': False, 'original_cases_modified_filtered_or_replaced': False,
        'npm_available_in_production': False}, indent=2) + '\n')
    invoke([*common, '--rm', *environment({**fixtures, 'NODE_ENV': 'test'}), image, '/bin/sh', '-c', scripts['test']],
           'original-image-cases.log', timeout=600)
elif mode == 'startup':
    values = {**fixtures, 'NODE_ENV': 'production', 'PUBLIC_URL': 'https://sharet-ci.invalid',
              'CORS_ORIGIN': 'https://sharet-ci.invalid', 'TRELLO_API_KEY': 'test-key', 'BILLING_MODE': 'off'}
    container = subprocess.check_output([*common, '-d', *environment(values), image], text=True).strip()
    assert re.fullmatch('[a-f0-9]{64}', container)
    try:
        deadline = time.monotonic() + 300
        while True:
            state = json.loads(subprocess.check_output(['docker', 'inspect', '--format', '{{json .State}}', container]))
            (folder / 'production-profile-state.json').write_text(json.dumps(state, indent=2) + '\n')
            status = state.get('Health', {}).get('Status')
            if status == 'healthy':
                break
            if state['Status'] != 'running' or status == 'unhealthy' or time.monotonic() >= deadline:
                raise RuntimeError('Original image readiness command did not qualify; retain the failed state')
            time.sleep(3)
        (folder / 'production-profile-summary.json').write_text(json.dumps({
            'original_Dockerfile_healthcheck_passed': True, 'NODE_ENV': 'production', 'uid': 10001,
            'network': 'none', 'root_filesystem': 'read-only', 'ephemeral_data_only': True,
            'fixture_credentials_only': True, 'real_provider_billing_TLS_and_operator_data_acceptance': False}, indent=2) + '\n')
    finally:
        with (folder / 'production-profile.log').open('wb') as output:
            subprocess.run(['docker', 'logs', container], stdout=output, stderr=subprocess.STDOUT, timeout=30)
        subprocess.run(['docker', 'stop', '--time', '20', container], check=True, timeout=40)
        subprocess.run(['docker', 'rm', container], check=True, timeout=30)
else:
    report = json.loads((folder / 'image-security.json').read_text())
    identity = json.loads((folder / 'image-identity.json').read_text())
    assert identity['verified_descriptor_chain'] and report['Metadata']['ImageID'] == identity['config_id']
    assert report['SchemaVersion'] == 2 and report['ArtifactType'] == 'container_image'
    assert not report['Metadata']['OS'].get('EOSL', False)
    rows = report.get('Results', [])
    assert rows and any(row.get('Class') == 'os-pkgs' and row.get('Packages') for row in rows)
    assert any(row.get('Type') == 'node-pkg' and row.get('Packages') for row in rows)
    findings = [finding for row in rows for key in ['Vulnerabilities', 'ExperimentalModifiedFindings']
                for finding in row.get(key) or []]
    (folder / 'image-security-summary.json').write_text(json.dumps({
        'config_id': identity['config_id'], 'complete_report_retained': True, 'raw_or_modified_findings': len(findings),
        'all_severities_required': True, 'advisory_or_source_exclusions': False,
        'all_components_current': False, 'operator_deployment_acceptance': False}, indent=2) + '\n')
    assert not findings, 'Raw or modified image findings remain; the complete report is retained'
