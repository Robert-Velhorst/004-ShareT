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
assert mode in {'before', 'prepare-tap21', 'integrity', 'resolved', 'after-cases'}
source = Path(os.environ['RUNNER_TEMP']) / 'npm-source'
reports = Path(os.environ['RUNNER_TEMP']) / 'sharet-build-toolchain/reports'
reports.mkdir(parents=True, exist_ok=True)
git = lambda *args: subprocess.check_output(['git', '-C', str(source), *args])
assert git('rev-parse', 'HEAD').decode().strip() == 'ae98c62586b6fea44114f72e249e246a2981de70'
if mode == 'prepare-tap21':
    original = json.loads((reports / 'npm-source-before.json').read_text())['tracked_payload_sha256']
    manifest = json.loads((source / 'package.json').read_text())
    candidates = {source / 'package.json'}
    for pattern in manifest['workspaces']:
        candidates.update(p / 'package.json' for p in source.glob(pattern) if p.is_dir())
    planned = {}
    for path in sorted(candidates):
        if not path.is_file():
            continue
        name = path.relative_to(source).as_posix()
        raw = path.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == original[name]
        package = json.loads(raw)
        if 'tap' not in package.get('devDependencies', {}):
            continue
        previous = raw.decode()
        package['devDependencies']['tap'] = '21.8.0'
        updated = (json.dumps(package, indent=2, ensure_ascii=False) + '\n').encode()
        path.write_bytes(updated)
        planned[name] = {'original_json': previous,
                         'expected_sha256': hashlib.sha256(updated).hexdigest(),
                         'only_declared_change': 'devDependencies.tap -> public stable 21.8.0'}
    assert planned and 'package.json' in planned
    (reports / 'npm-source-planned-manifest-changes.json').write_text(json.dumps(planned, indent=2) + '\n')
    print(json.dumps({'public_stable_tap': '21.8.0', 'declared_workspace_manifests': sorted(planned),
                      'test_or_assertion_changes': False}))
    sys.exit(0)
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
    # The unchanged upstream `dependencies` lifecycle regenerates these graph
    # documents through scripts/dependency-graph.js after a normal update.
    # Preserve their actual bytes; application/vendor source and cases remain
    # protected, and the complete dependency audit still gates the candidate.
    generated = {'DEPENDENCIES.md', 'DEPENDENCIES.json'}
    plan_file = reports / 'npm-source-planned-manifest-changes.json'
    planned = json.loads(plan_file.read_text()) if plan_file.is_file() else {}
    for name, change in planned.items():
        old = change['original_json'].encode()
        assert hashlib.sha256(old).hexdigest() == before[name]
        expected = json.loads(old)
        expected['devDependencies']['tap'] = '21.8.0'
        assert json.loads((source / name).read_text()) == expected
        assert hashes[name] == change['expected_sha256']
    protected = {p: h for p, h in before.items()
                 if not p.startswith('node_modules/') and p != 'package-lock.json'
                 and p not in generated and p not in planned}
    changed = [p for p, h in protected.items() if hashes.get(p) != h]
    lock = json.loads((source / 'package-lock.json').read_text())
    packages = lock['packages']
    unstable = {p: row.get('version') for p, row in packages.items()
                if not row.get('link') and row.get('version') is not None
                and not re.fullmatch(r'\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?', row['version'])}
    (reports / 'npm-source-resolved-stability.json').write_text(json.dumps({
        'lock_sha256': hashlib.sha256((source / 'package-lock.json').read_bytes()).hexdigest(),
        'package_records': len(packages), 'unstable_versions': unstable,
        'protected_original_payloads': len(protected),
        'changed_protected_payloads': changed,
        'original_case_or_source_changes': bool(changed),
        'explicit_planned_manifest_changes': sorted(planned),
        'upstream_generated_graph_documents': {p: hashes.get(p) for p in generated}}, indent=2) + '\n')
    (reports / 'npm-source-package-lock.json').write_bytes((source / 'package-lock.json').read_bytes())
    for name in generated:
        if (source / name).is_file():
            (reports / ('npm-source-generated-' + name)).write_bytes((source / name).read_bytes())
    assert not changed, 'Original source/cases/assertions changed: ' + repr(changed)
    assert (source / 'DEPENDENCIES.md').read_text().startswith('<!-- This file is automatically added by `scripts/dependency-graph.js`. Do not edit. -->')
    if mode == 'resolved':
        assert not unstable, 'Prerelease/non-stable dependency versions remain in the actual resolved graph'
