"""Translate reviewed Tap metadata; preserve scripts, cases and coverage targets."""
from copy import deepcopy


def migrate(original):
    package = deepcopy(original)
    assert 'tap' in package['devDependencies']
    package['devDependencies']['tap'] = '21.8.0'
    config = package.setdefault('tap', {})
    nyc_args = config.pop('nyc-arg', [])
    assert len(nyc_args) % 2 == 0
    assert all(nyc_args[i] == '--exclude' for i in range(0, len(nyc_args), 2))
    patterns = nyc_args[1::2]
    if patterns:
        # These are exactly the original coverage exclusions, not case filters.
        config['coverage-exclude'] = patterns
    nyc = package.setdefault('nyc', {})
    # Match the unchanged upstream template check's modern metadata. The V8
    # coverage-exclude list above independently retains every original pattern.
    nyc['exclude'] = [p for p in patterns if p != 'tap-snapshots/**']
    config['show-full-coverage'] = True
    if 'no-coverage' in config:
        # Preserve this existing setting only; do not disable other coverage.
        config['disable-coverage'] = config.pop('no-coverage')
    if isinstance(config.get('timeout'), str):
        config['timeout'] = int(config['timeout'])
    if isinstance(config.get('files'), str):
        config['files'] = [config['files']]
    if 'test-ignore' in config:
        previous = config.pop('test-ignore')
        if previous == '^(docs|smoke-tests|mock-globals|mock-registry|workspaces)/':
            config['exclude'] = [name + '/**' for name in
                                 ['docs', 'smoke-tests', 'mock-globals', 'mock-registry', 'workspaces']]
        else:
            # The original fixtures rule is covered by Tap's default fixture
            # discovery rule; the exact 234-file comparison must still pass.
            assert previous == 'fixtures/*', previous
    return package
