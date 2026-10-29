"""Metadata-only lock resolution on a disposable GitHub-hosted Linux worker."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(os.environ['GITHUB_WORKSPACE'])
OUT = Path(os.environ['RUNNER_TEMP']) / 'electron-lock-resolution'
OUT.mkdir(exist_ok=False)
CASES = [
    ('008', ROOT / 'sneup', 'e39eaa73f657fbe30675891702090c32d9fc8e54', '^44.8.0', '^45.1.0', 'package-lock.json'),
    ('010', ROOT / 'hulpgids', 'bb3c9351ec63d0f7002d731ad9b30a30bd984f0a', '44.9.0', '45.1.0', 'pnpm-lock.yaml'),
]
assert os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_OS') == 'Linux'
report = {'scope': 'Metadata-only resolution. No application install, test, guest data, production or deployment acceptance.', 'cases': []}

def output(argv, cwd):
    return subprocess.check_output(argv, cwd=cwd, text=True).strip()

def tracked_snapshot(repo):
    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=repo).decode().split('\0')
    return {path: hashlib.sha256((repo / path).read_bytes()).hexdigest() for path in paths if path and (repo / path).is_file()}

try:
    assert output(['node', '--version'], ROOT) == 'v26.13.0'
    assert output(['npm', '--version'], ROOT) == '12.2.1'
    assert output(['pnpm', '--version'], ROOT) == '12.16.1'
    for name, repo, expected, old, new, lock in CASES:
        row = {'name': name, 'expected_head': expected, 'lock': lock, 'status': 'started'}
        report['cases'].append(row)
        assert output(['git', 'rev-parse', 'HEAD'], repo) == expected
        assert not output(['git', 'status', '--porcelain'], repo)
        assert not (repo / 'node_modules').exists()
        before = tracked_snapshot(repo)
        manifest = repo / 'package.json'
        text = manifest.read_text(encoding='utf-8')
        assert json.loads(text)['devDependencies']['electron'] == old
        needle = '"electron": "' + old + '"'
        assert text.count(needle) == 1
        manifest.write_text(text.replace(needle, '"electron": "' + new + '"'), encoding='utf-8')
        args = ['npm', 'install', '--package-lock-only'] if name == '008' else ['pnpm', 'install', '--lockfile-only', '--no-frozen-lockfile']
        row['command'] = args
        with (OUT / (name + '-resolution.log')).open('wb') as log:
            result = subprocess.run(args, cwd=repo, stdout=log, stderr=subprocess.STDOUT, timeout=900)
        row['returncode'] = result.returncode
        if result.returncode: raise RuntimeError(name + ' lock resolution failed')
        assert not (repo / 'node_modules').exists(), 'lock-only command created an application dependency tree'
        after = tracked_snapshot(repo)
        assert set(before) == set(after)
        changed = [k for k in before if before[k] != after[k]]
        assert set(changed) <= {'package.json', lock} and 'package.json' in changed and lock in changed
        lockbytes = (repo / lock).read_bytes()
        if name == '008':
            parsed = json.loads(lockbytes)
            assert parsed['packages']['node_modules/electron']['version'] == '45.1.0'
        else:
            assert re.search(rb'electron@45\.1\.0(?:\b|\()', lockbytes)
        (OUT / (name + '-' + lock)).write_bytes(lockbytes)
        (OUT / (name + '-package.json')).write_bytes(manifest.read_bytes())
        row.update({'status': 'resolved', 'changed_tracked_paths': changed,
                    'source_payloads_unchanged': len(before) - len(changed),
                    'lock_sha256': hashlib.sha256(lockbytes).hexdigest(),
                    'application_tests_run': False, 'dependency_install_proven': False})
finally:
    (OUT / 'result.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
