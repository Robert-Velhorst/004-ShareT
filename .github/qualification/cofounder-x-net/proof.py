"""Hosted original x/net SDK qualification with a stable verified module graph."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

owner=Path.cwd();sdk=owner/'qualification-x-net-sdk'
inputs=owner/'.github/qualification/cofounder-x-net'
out=Path(os.environ['RUNNER_TEMP'])/'cofounder-x-net-sdk';out.mkdir(exist_ok=True)
expected=json.loads((inputs/'SDK-tree.json').read_text())
configuration=json.loads((inputs/'execution-inputs.json').read_text())
versions=configuration['versions']
assert not expected['truncated']
def snapshot():
    rows={}
    for row in expected['tree']:
        if row['type']!='blob':continue
        path=sdk/row['path']
        raw=os.readlink(path).encode() if row['mode']=='120000' else path.read_bytes()
        blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
        rows[row['path']]={'blob':blob,'sha256':hashlib.sha256(raw).hexdigest()}
    return rows
before=snapshot();assert all(before[r['path']]['blob']==r['sha'] for r in expected['tree'] if r['type']=='blob')
commands=[]
def run(args,label,timeout=300):
    start=datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        result=subprocess.run(args,cwd=sdk,capture_output=True,timeout=timeout)
        code=result.returncode;stdout=result.stdout;stderr=result.stderr
    except subprocess.TimeoutExpired as error:
        code=124;stdout=error.stdout or b'';stderr=(error.stderr or b'')+b'\nOwned outer worker observation deadline reached; no SDK timeout changed.\n'
    (out/(label+'.stdout.log')).write_bytes(stdout);(out/(label+'.stderr.log')).write_bytes(stderr)
    commands.append({'command':args,'label':label,'started_at':start,'exit_code':code})
    return code,stdout
report={'upstream_commit':'3de643db506517b3e652a13cc0b56034cea6b8e6','before':before,'commands':commands,
        'original_cases_helpers_commands_modified':False,'full_Caddy_image_application_deployment_data_acceptance':False}
prepared=None
try:
    actual_go=subprocess.check_output(['go','version'],text=True).strip();assert 'go1.27.3 ' in actual_go
    environment=json.loads(subprocess.check_output(['go','env','-json','GOVERSION','GOTOOLCHAIN','GOFLAGS','GOSUMDB','GONOSUMDB','GOPRIVATE','GOINSECURE','GOOS','GOARCH'],cwd=sdk))
    assert environment['GOTOOLCHAIN']=='local' and environment['GOSUMDB']=='sum.golang.org'
    assert all(environment[k]=='' for k in ('GOFLAGS','GONOSUMDB','GOPRIVATE','GOINSECURE'))
    report.update(actual_go=actual_go,go_environment=environment)
    with urllib.request.urlopen('https://go.dev/dl/?mode=json',timeout=45) as response:releases=json.load(response)
    stable=[r for r in releases if r['stable']];highest=max(stable,key=lambda r:tuple(map(int,r['version'][2:].split('.'))))
    assert highest['version']=='go1.27.3';report['official_current_Go_release']=highest
    requirements=configuration['SDK_current_requirements']
    # Declarations are resolved as inert metadata. This does not permit
    # installing/executing any selected nonstable version below.
    assert all(re.fullmatch(r'v\d+\.\d+\.\d+(?:-[0-9A-Za-z.\-]+)?',v) for v in requirements.values())
    assert run(['go','mod','edit']+['-require='+m+'@'+v for m,v in sorted(requirements.items())],'explicit-current-SDK-requirements')[0]==0
    code,raw=run(['go','list','-mod=mod','-m','-json','all'],'normal-selected-module-graph');assert code==0
    decoder=json.JSONDecoder();text=raw.decode();modules=[]
    while text.strip():
        record,end=decoder.raw_decode(text.lstrip());modules.append(record);text=text.lstrip()[end:]
    actual={m['Path']:m['Version'] for m in modules if not m.get('Main')}
    report['selected_module_graph']=modules
    assert all(actual[m]==v for m,v in versions.items() if m!='golang.org/x/net'), 'Direct declaration mismatch'
    nonstable={m:v for m,v in actual.items() if not re.fullmatch(r'v\d+\.\d+\.\d+',v)}
    assert not nonstable, 'Unapproved nonstable selected versions: '+json.dumps(nonstable,sort_keys=True)
    assert all('Replace' not in m for m in modules)
    references={}
    for name,version in actual.items():
        with urllib.request.urlopen('https://proxy.golang.org/'+name+'/@latest',timeout=45) as response:reference=json.load(response)
        references[name]=reference
        assert version==reference['Version'], 'Selected module is not highest public stable: '+name
    report['all_selected_module_public_references']=references
    assert run(['go','mod','download'],'normal-module-download')[0]==0
    assert run(['go','mod','verify'],'normal-module-integrity')[0]==0
    prepared=snapshot()
    changed=[p for p in before if before[p]!=prepared[p]]
    assert set(changed).issubset({'go.mod','go.sum'}), 'Unexpected original SDK code or case change'
    report['prepared']=prepared
    report['SDK_dependency_profile_source_port_paths']=changed
    report['modified_dependency_profile_not_an_unmodified_publisher_build']=True
    code,packages=run(['go','list','./...'],'original-platform-package-inventory');assert code==0
    report['original_platform_packages']=packages.decode().splitlines()
    regression_source='\n'.join(p.read_text() for p in (sdk/'html').glob('*_test.go'))
    names=['TestTextNodeCoalescing','TestRenderFosteredForeignContent']
    assert all(re.search(r'func\s+'+name+r'\s*\(',regression_source) for name in names)
    focus,focus_output=run(['go','test','-v','./html','-run','^(TestTextNodeCoalescing|TestRenderFosteredForeignContent)$'],'original-security-regressions',600)
    assert focus==0 and all(('--- PASS: '+name).encode() in focus_output for name in names)
    full,full_output=run(['go','test','./...'],'original-complete-SDK-suite',1500)
    report.update(original_security_regressions_passed=names,full_original_SDK_command_exit_code=full,
                  full_original_SDK_command=['go','test','./...'],new_short_skip_or_exclusion_flags=False,
                  inherited_platform_or_runtime_skips_not_enumerated_by_default_output=True)
    assert full==0
    report['SDK_linux_command_qualification_passed']=True
except Exception as error:
    report['stopped_reason']=str(error);report['SDK_linux_command_qualification_passed']=False
finally:
    after=snapshot();report['after']=after
    report['all_original_nonmanifest_payloads_unchanged']=all(after[p]==value for p,value in before.items() if p not in ('go.mod','go.sum'))
    report['prepared_payloads_unchanged_during_tests']=prepared==after if prepared else None
    report['commands']=commands
    (out/'SDK-source-graph-and-tests.json').write_text(json.dumps(report,indent=2)+'\n')
    (out/'original-go.mod').write_bytes((sdk/'go.mod').read_bytes());(out/'original-go.sum').write_bytes((sdk/'go.sum').read_bytes())
    print(json.dumps({k:v for k,v in report.items() if k not in ('before','prepared','after','official_current_Go_release','selected_module_graph','original_platform_packages')},indent=2))
sys.exit(0 if report.get('SDK_linux_command_qualification_passed') and report['all_original_nonmanifest_payloads_unchanged'] and report['prepared_payloads_unchanged_during_tests'] else 1)
