"""Reviewable publisher-bound compatibility port; no case/coverage edits.

Large original exclusion lists exceed Linux's per-environment-string limit.
Transfer exactly the same UTF-8 bytes through an exclusive private file, verify
their digest on receipt, then run the unchanged coverage selection logic.
This is a local source port, not an unmodified publisher-release claim.
"""
from pathlib import Path
import hashlib
import json
import os
import sys


def replace_once(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old, new, 1)


def transform(name, text):
    if name.endswith('/run.js'):
        text = "import * as coverageTransportFs from 'node:fs';\nimport * as coverageTransportCrypto from 'node:crypto';\n" + text
        text = replace_once(text,
            'let _TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_ = undefined;',
            'let _TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_ = undefined;\n    let coverageTransportFile;\n    let coverageTransportDigest;')
        text = replace_once(text,
            'if (!_TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_) {',
            'if (!_TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_ && !coverageTransportFile) {')
        anchor = "            ].join('\\n');"
        extra = r'''
            if (Buffer.byteLength(_TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_) > 65536) {
                const payload = _TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_;
                const directory = resolve(config.projectRoot, '.tap/coverage-transport');
                coverageTransportFs.mkdirSync(directory, { recursive: true, mode: 0o700 });
                coverageTransportFile = resolve(directory, coverageTransportCrypto.randomUUID() + '.txt');
                coverageTransportDigest = coverageTransportCrypto.createHash('sha256').update(payload).digest('hex');
                coverageTransportFs.writeFileSync(coverageTransportFile, payload, { flag: 'wx', mode: 0o600 });
                if (process.env.TAP_COVERAGE_TRANSPORT_REPORT) {
                    coverageTransportFs.appendFileSync(process.env.TAP_COVERAGE_TRANSPORT_REPORT,
                        JSON.stringify({ event: 'writer', sha256: coverageTransportDigest,
                            bytes: Buffer.byteLength(payload), paths: payload.split('\n').length,
                            protocol: 'exact-original-utf8-file-v1' }) + '\n');
                }
                _TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_ = undefined;
            }'''
        text = replace_once(text, anchor, anchor + '\n' + extra)
        text = replace_once(text,
            '                    _TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_,',
            '                    _TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_,\n                    _TAPJS_PROCESSINFO_COV_EXCLUDE_FILE_: coverageTransportFile,\n                    _TAPJS_PROCESSINFO_COV_EXCLUDE_FILE_SHA256_: coverageTransportDigest,')
        return text
    assert name.endswith('/register-coverage.js')
    # Both distributed module formats must consume the same exact protocol.
    if '/esm/' in name:
        text = "import * as coverageTransportFs from 'node:fs';\nimport * as coverageTransportCrypto from 'node:crypto';\n" + text
    else:
        text = replace_once(text, '"use strict";',
            '"use strict";\nconst coverageTransportFs = require("node:fs");\nconst coverageTransportCrypto = require("node:crypto");')
    original = "const cxEnv = p.env._TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_ || '';"
    replacement = r'''const readCoverageExclusionFile = () => {
    const file = p.env._TAPJS_PROCESSINFO_COV_EXCLUDE_FILE_;
    if (!file) return '';
    if (p.env._TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_)
        throw new Error('Ambiguous coverage exclusion transport');
    const payload = coverageTransportFs.readFileSync(file);
    const digest = coverageTransportCrypto.createHash('sha256').update(payload).digest('hex');
    if (digest !== p.env._TAPJS_PROCESSINFO_COV_EXCLUDE_FILE_SHA256_)
        throw new Error('Coverage exclusion transport checksum mismatch');
    const text = payload.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(payload))
        throw new Error('Invalid UTF-8 coverage exclusion transport');
    if (p.env.TAP_COVERAGE_TRANSPORT_REPORT) {
        coverageTransportFs.appendFileSync(p.env.TAP_COVERAGE_TRANSPORT_REPORT,
            JSON.stringify({ event: 'reader', sha256: digest, bytes: payload.length,
                paths: text.split('\n').length, protocol: 'exact-original-utf8-file-v1' }) + '\n');
    }
    return text;
};
const cxEnv = readCoverageExclusionFile() || p.env._TAPJS_PROCESSINFO_COV_EXCLUDE_FILES_ || '';'''
    # Keep the original explicit-list/exclude-regex precedence and membership
    # checks byte-for-byte after the single input acquisition statement.
    return replace_once(text, original, replacement)


def main():
    assert os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted' and sys.platform == 'linux'
    source = Path(os.environ['RUNNER_TEMP']) / 'npm-source/node_modules'
    reports = Path(os.environ['RUNNER_TEMP']) / 'sharet-build-toolchain/reports'
    expected = json.loads(Path(__file__).with_name('tap-coverage-transport-publisher-hashes.json').read_text())
    if len(sys.argv) == 2:
        assert sys.argv[1] == 'verify'
        record = json.loads((reports / 'tap-coverage-transport-source-port.json').read_text())
        assert set(record['files']) == set(expected)
        for name, entry in record['files'].items():
            original = (reports / entry['original_payload']).read_bytes()
            modified = (reports / entry['modified_payload']).read_bytes()
            assert hashlib.sha256(original).hexdigest() == entry['original_sha256'] == expected[name]
            assert transform(name, original.decode()).encode() == modified == (source / name).read_bytes()
            assert hashlib.sha256(modified).hexdigest() == entry['modified_sha256']
        events = [json.loads(line) for line in
            (reports / 'npm-source-coverage-transport-events.jsonl').read_text().splitlines()]
        writers = {row['sha256']: row for row in events if row['event'] == 'writer'}
        readers = [row for row in events if row['event'] == 'reader']
        for row in readers:
            assert all(row[key] == writers[row['sha256']][key]
                for key in ['sha256', 'bytes', 'paths', 'protocol'])
        (reports / 'tap-coverage-transport-after-cases.json').write_text(json.dumps({
            'all_three_ported_modules_unchanged': True,
            'writer_payloads': len(writers), 'reader_events': len(readers),
            'every_observed_reader_matches_writer_bytes_hash_count': True,
            'actual_transport_observed': bool(writers and readers),
            'full_original_suite_acceptance_claimed': False,
        }, indent=2) + '\n')
        assert writers and readers, 'Both actual writer and verified reader events are required'
        return
    assert len(sys.argv) == 1
    record = {'protocol': 'exact-original-utf8-file-v1', 'source_port_applied': True,
              'unmodified_publisher_release_claimed': False, 'modified_case_files': [],
              'modified_coverage_patterns_or_thresholds': False, 'files': {}}
    prepared = {}
    for name, digest in expected.items():
        original = (source / name).read_bytes()
        assert hashlib.sha256(original).hexdigest() == digest, name
        modified = transform(name, original.decode()).encode()
        prepared[name] = (original, modified)
    assert len(prepared) == 3
    for index, (name, (original, modified)) in enumerate(prepared.items()):
        before_name, after_name = f'tap-coverage-port-{index}-original.js', f'tap-coverage-port-{index}-modified.js'
        (reports / before_name).write_bytes(original)
        (reports / after_name).write_bytes(modified)
        (source / name).write_bytes(modified)
        record['files'][name] = {'original_sha256': hashlib.sha256(original).hexdigest(),
            'modified_sha256': hashlib.sha256(modified).hexdigest(),
            'original_payload': before_name, 'modified_payload': after_name}
    (reports / 'tap-coverage-transport-source-port.json').write_text(json.dumps(record, indent=2) + '\n')


if __name__ == '__main__':
    main()
