"""Verify immutable full source, port explicitly, qualify native helper and resolve full SDK graph."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

root=Path.cwd()
sdk=root/'qualification-tape-sdk'
inputs=root/'.github/qualification/tape-native-resolver'
out=Path(os.environ['RUNNER_TEMP'])/'tape-native-resolver'
out.mkdir(exist_ok=True)
tree=json.loads((inputs/'publisher-tree.json').read_text())
assert not tree['truncated']
records=[r for r in tree['tree'] if r['type']=='blob']
def snapshot():
    result={}
    for row in records:
        raw=(sdk/row['path']).read_bytes()
        result[row['path']]={'blob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'sha256':hashlib.sha256(raw).hexdigest()}
    helper=sdk/'lib/resolve-module.js'
    if helper.exists():
        raw=helper.read_bytes();result['lib/resolve-module.js']={'blob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'sha256':hashlib.sha256(raw).hexdigest()}
    return result
before=snapshot()
assert all(before[r['path']]['blob']==r['sha'] for r in records)
manifest=json.loads((sdk/'package.json').read_text())
profile=json.loads((inputs/'candidate-package.json').read_text())
assert profile['version']==manifest['version']=='5.10.3' and profile['scripts']==manifest['scripts']
assert set(profile['dependencies'])==set(manifest['dependencies'])-{'resolve'}
assert set(profile['devDependencies'])==set(manifest['devDependencies'])
assert all(re.fullmatch(r'\d+\.\d+\.\d+',v) for k in ('dependencies','devDependencies') for v in profile[k].values())
assert not any(k in profile for k in ('overrides','resolutions'))
original_bin=(sdk/'bin/tape').read_bytes()
candidate_bin=(inputs/'candidate-bin-tape').read_bytes()
assert original_bin.replace(b"require('resolve').sync",b"require('../lib/resolve-module')")==candidate_bin
for name in ('candidate-package.json','candidate-bin-tape','resolve-module.js'):
    destination={'candidate-package.json':'package.json','candidate-bin-tape':'bin/tape','resolve-module.js':'lib/resolve-module.js'}[name]
    (sdk/destination).write_bytes((inputs/name).read_bytes())
prepared=snapshot()
changed=[p for p in prepared if before.get(p)!=prepared[p]]
assert set(changed)=={'package.json','bin/tape','lib/resolve-module.js'}
cases=subprocess.run(['node',str(inputs/'native-resolver-cases.cjs')],capture_output=True,timeout=60)
(out/'owned-cases.stdout.log').write_bytes(cases.stdout);(out/'owned-cases.stderr.log').write_bytes(cases.stderr)
assert snapshot()==prepared
command=['npm','install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund']
resolution=subprocess.run(command,cwd=sdk,capture_output=True,timeout=600)
(out/'resolver.stdout.log').write_bytes(resolution.stdout);(out/'resolver.stderr.log').write_bytes(resolution.stderr)
assert not (sdk/'node_modules').exists() and snapshot()==prepared
lock=sdk/'package-lock.json'
nonstable=None
if lock.exists():
    lock_data=json.loads(lock.read_text())
    (out/'package-lock.json').write_bytes(lock.read_bytes())
    nonstable=[{'path':p,'version':r['version']} for p,r in lock_data.get('packages',{}).items() if p and 'version'in r and not re.fullmatch(r'\d+\.\d+\.\d+',r['version'])]
report={'upstream_commit':'223d58ebbde2c4a8505ea1ecd149408b87e8423a','before':before,'prepared_and_after':prepared,
        'deliberate_source_paths':changed,'original_case_helper_command_bodies_unchanged':True,
        'owned_native_case_exit_code':cases.returncode,'resolver_command':command,'resolver_exit_code':resolution.returncode,
        'nonstable_resolved_packages':nonstable,'current_direct_target_count':68,
        'dependency_installation_or_original_SDK_cases_execution':False,'full_acceptance':False}
(out/'qualification-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('before','prepared_and_after')}))
sys.exit(1 if cases.returncode or resolution.returncode or nonstable else 0)
