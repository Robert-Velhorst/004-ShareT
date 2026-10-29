"""Owned metadata-only graph qualification. No package installation or SDK cases."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

owner = Path.cwd()
sdk = owner / 'qualification-pouchdb-sdk'
out = Path(os.environ['RUNNER_TEMP']) / 'pouchdb-current-profile'
out.mkdir(exist_ok=True)
prefix = owner / '.github/qualification/pouchdb-current-profile'
expected = json.loads((prefix / 'publisher-tree.json').read_text())['tree']
records = [r for r in expected['tree'] if r['type'] == 'blob']
assert not expected['truncated']
head = subprocess.check_output(['git', '-C', str(sdk), 'rev-parse', 'HEAD'], text=True).strip()
assert head == '194c0754bb482824c3cb07d6432c7b95707d0a72'

def hashes():
    result = {}
    for row in records:
        raw = (sdk / row['path']).read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        result[row['path']] = {'blob': blob, 'sha256': hashlib.sha256(raw).hexdigest()}
    return result

before = hashes()
assert all(before[r['path']]['blob'] == r['sha'] for r in records)
original = json.loads((sdk / 'package.json').read_text())
profile = json.loads((prefix / 'package.json').read_text())
assert profile['scripts'] == original['scripts']
assert profile['version'] == original['version']
assert set(profile['dependencies']) == (set(original['dependencies']) - {'double-ended-queue'}) | {'denque'}
assert set(profile['devDependencies']) == set(original['devDependencies'])
for group in ('dependencies', 'devDependencies'):
    assert all(re.fullmatch(r'\d+\.\d+\.\d+', v) for v in profile[group].values())
assert not any(k in profile for k in ('overrides', 'resolutions'))
(sdk / 'package.json').write_bytes((prefix / 'package.json').read_bytes())
adapter = sdk / 'packages/node_modules/pouchdb-adapter-leveldb-core/src/index.js'
raw = adapter.read_bytes()
assert raw.count(b"import Deque from 'double-ended-queue';") == 1
adapter.write_bytes(raw.replace(b"import Deque from 'double-ended-queue';", b"import Deque from 'denque';"))
prepared = hashes()
changes = [p for p in before if before[p] != prepared[p]]
assert set(changes) == {'package.json', 'packages/node_modules/pouchdb-adapter-leveldb-core/src/index.js'}
command = ['npm', 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']
result = subprocess.run(command, cwd=sdk, capture_output=True, timeout=600)
(out / 'resolver.stdout.log').write_bytes(result.stdout)
(out / 'resolver.stderr.log').write_bytes(result.stderr)
assert not (sdk / 'node_modules').exists(), 'No dependency installation is permitted'
after = hashes()
assert after == prepared, 'Resolver changed tracked publisher source'
report = {'publisher_commit': head, 'publisher_payload_count': len(records),
          'source_before': before, 'source_prepared_and_after': after,
          'deliberate_source_paths': changes, 'resolver_command': command,
          'resolver_exit_code': result.returncode, 'package_installation': False,
          'SDK_or_application_cases_executed': False, 'original_commands_and_cases_unchanged': True,
          'full_SDK_or_image_or_deployment_or_data_acceptance': False,
          'node': subprocess.check_output(['node', '--version'], text=True).strip(),
          'npm': subprocess.check_output(['npm', '--version'], text=True).strip()}
lock = sdk / 'package-lock.json'
if lock.exists():
    lock_data = json.loads(lock.read_text())
    report['lock_sha256'] = hashlib.sha256(lock.read_bytes()).hexdigest()
    report['nonstable_resolved_packages'] = [
        {'path': p, 'name': r.get('name'), 'version': r['version']}
        for p, r in lock_data.get('packages', {}).items()
        if p and 'version' in r and not re.fullmatch(r'\d+\.\d+\.\d+', r['version'])]
    report['resolved_package_count'] = len(lock_data.get('packages', {})) - 1
    (out / 'package-lock.json').write_bytes(lock.read_bytes())
else:
    report['nonstable_resolved_packages'] = None
(out / 'resolution-evidence.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('source_before','source_prepared_and_after')}))
sys.exit(1 if result.returncode or report['nonstable_resolved_packages'] else 0)
