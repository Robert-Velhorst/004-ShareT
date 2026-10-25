"""Compare reported case files with the independently retained original baseline."""
from pathlib import Path
import json
import os
import re
import sys
from collections import Counter

if sys.platform != 'linux' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
    raise RuntimeError('Use a disposable GitHub-hosted Linux worker')

reference = json.loads(Path('tools/runtime/npm-original-case-file-inventory.json').read_text())
assert reference['upstream_source_head'] == 'ae98c62586b6fea44114f72e249e246a2981de70'
folder = Path(os.environ['RUNNER_TEMP']) / 'sharet-build-toolchain/reports'
text = (folder / 'npm-source-all-original-cases.log').read_text()
before = json.loads((folder / 'npm-source-before.json').read_text())
assert before['source_head'] == reference['upstream_source_head']
expected = reference['workspaces']
assert len(expected) == 17 and sum(len(w['case_files']) for w in expected.values()) == 234
observed, current = {}, None
for line in text.splitlines():
    match = re.fullmatch(r'npm notice run (.+) test', line)
    if match and match.group(1) in expected:
        current = match.group(1)
        observed.setdefault(current, [])
    if current and line.startswith('# Subtest: '):
        label = line[len('# Subtest: '):]
        observed[current].append(label)
missing, extra, duplicates = {}, {}, {}
for name, workspace in expected.items():
    wanted = set(workspace['case_files'])
    found = set(observed.get(name, []))
    if wanted - found:
        missing[name] = sorted(wanted - found)
    if found - wanted:
        extra[name] = sorted(found - wanted)
    repeated = {label: count for label, count in Counter(observed.get(name, [])).items() if count != 1}
    if repeated:
        duplicates[name] = repeated
    for label, digest in workspace['case_files'].items():
        source_path = '/'.join(p for p in [workspace['directory'], label] if p)
        assert before['tracked_payload_sha256'][source_path] == digest
report = {'baseline_head': reference['baseline_head'],
          'baseline_artifact_sha256': reference['baseline_artifact_sha256'],
          'expected_workspace_count': len(expected), 'observed_workspace_count': len(observed),
          'expected_case_file_count': sum(len(w['case_files']) for w in expected.values()),
          'observed_file_headers': sum(len(v) for v in observed.values()),
          'missing_original_files': missing, 'unexpected_file_labels': extra,
          'duplicate_file_labels': duplicates,
          'observed': observed, 'scope': 'File inventory only; suite success/coverage remain separate required gates'}
(folder / 'npm-source-original-case-inventory-comparison.json').write_text(json.dumps(report, indent=2) + '\n')
assert set(observed) == set(expected) and not missing and not extra and not duplicates, 'Original case-file inventory changed'
