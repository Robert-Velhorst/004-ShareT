"""Record a pinned public workspace and reject altered source or prereleases."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys

if sys.platform != 'linux' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
    raise RuntimeError('Use a disposable GitHub-hosted Linux worker')

mode = sys.argv[1]
assert mode in {'before', 'resolved', 'after-cases'}
source = Path('.npm-source').resolve()
reports = Path(os.environ['RUNNER_TEMP']) / 'sharet-build-toolchain/reports'
reports.mkdir(parents=True, exist_ok=True)
git = lambda *args: subprocess.check_output(['git', '-C', str(source), *args])
assert git('rev-parse', 'HEAD').decode().strip() == 'ae98c62586b6fea44114f72e249e246a2981de70'
paths = git('ls-files', '-z').decode().split('\0')
hashes = {}
for name in paths:
    if not name:
        continue
    path = source / name
    if path.is_symlink():
        raw = os.readlink(path).encode()
    elif path.is_file():
        raw = path.read_bytes()
    else:
        raw = b'<missing>'
    hashes[name] = hashlib.sha256(raw).hexdigest()
receipt = {'source_head': git('rev-parse', 'HEAD').decode().strip(),
           'tracked_payload_sha256': hashes,
           'git_status': git('status', '--porcelain=v1').decode(),
           'mode': mode}
(reports / ('npm-source-' + mode + '.json')).write_text(json.dumps(receipt, indent=2) + '\n')
if mode == 'before':
    assert not receipt['git_status'], 'The upstream checkout must start clean'
else:
    before = json.loads((reports / 'npm-source-before.json').read_text())['tracked_payload_sha256']
    protected = {p: h for p, h in before.items()
                 if not p.startswith('node_modules/') and p != 'package-lock.json'}
    assert all(hashes.get(p) == h for p, h in protected.items()), 'Original source/cases/assertions changed'
    lock = json.loads((source / 'package-lock.json').read_text())
    packages = lock['packages']
    unstable = {p: row.get('version') for p, row in packages.items()
                if not row.get('link') and row.get('version') is not None
                and not re.fullmatch(r'\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?', row['version'])}
    (reports / 'npm-source-resolved-stability.json').write_text(json.dumps({
        'lock_sha256': hashlib.sha256((source / 'package-lock.json').read_bytes()).hexdigest(),
        'package_records': len(packages), 'unstable_versions': unstable,
        'protected_original_payloads': len(protected),
        'original_case_or_source_changes': False}, indent=2) + '\n')
    (reports / 'npm-source-package-lock.json').write_bytes((source / 'package-lock.json').read_bytes())
    assert not unstable, 'Prerelease/non-stable dependency versions remain in the actual resolved graph'
