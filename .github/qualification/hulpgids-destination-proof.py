"""Hosted exact-source caller-destination proof; compiler graph only, no application install."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

owner=Path.cwd()
source=owner/'qualification-hulpgids-source'
out=Path(os.environ['RUNNER_TEMP'])/'hulpgids-destination-boundary'
out.mkdir(exist_ok=True)
os.environ['PROVIDER_DESTINATION_EVIDENCE']=str(out)
def snapshot(root):
    result={}
    for entry in subprocess.check_output(['git','-C',str(root),'ls-files','--stage','-z']).split(b'\0'):
        if not entry:continue
        metadata,path=entry.split(b'\t',1);mode,blob,stage=metadata.decode().split()
        assert mode in ('100644','100755') and stage=='0'
        name=path.decode();raw=(root/name).read_bytes()
        actual=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
        assert actual==blob
        result[name]={'blob':blob,'sha256':hashlib.sha256(raw).hexdigest()}
    return result
before_source=snapshot(source);before_owner=snapshot(owner)
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()=='d2f7a31be1d0b41b12679a43d5cce5ad4bf55dfe'
tools=out/'compiler';tools.mkdir()
(tools/'package.json').write_text('{"private":true,"devDependencies":{"esbuild":"0.28.2"}}\n')
def run(args,cwd,name):
    result=subprocess.run(args,cwd=cwd,capture_output=True,timeout=300)
    (out/(name+'.stdout.log')).write_bytes(result.stdout);(out/(name+'.stderr.log')).write_bytes(result.stderr)
    if result.returncode:raise RuntimeError(name+' failed: '+str(result.returncode))
    return result
assert subprocess.check_output(['npm','config','get','engine-strict'],text=True).strip()=='true'
assert subprocess.check_output(['npm','config','get','strict-peer-deps'],text=True).strip()=='true'
run(['npm','install','--package-lock-only','--ignore-scripts','--no-audit'],tools,'normal-lock')
lock=json.loads((tools/'package-lock.json').read_text())
assert all(not p or re.fullmatch(r'\d+\.\d+\.\d+',r['version']) for p,r in lock['packages'].items())
run(['npm','ci'],tools,'compiler-install')
audit=subprocess.run(['npm','audit','--json'],cwd=tools,capture_output=True,timeout=180)
(out/'compiler-audit.json').write_bytes(audit.stdout)
assert audit.returncode==0 and not json.loads(audit.stdout)['vulnerabilities']
installed=[]
for file in (tools/'node_modules').rglob('package.json'):
    manifest=json.loads(file.read_text())
    if 'name'in manifest and 'version'in manifest:
        assert re.fullmatch(r'\d+\.\d+\.\d+',manifest['version'])
        installed.append({'name':manifest['name'],'version':manifest['version'],'path':str(file.relative_to(tools))})
reference={}
for name in ('esbuild','npm'):
    with urllib.request.urlopen('https://registry.npmjs.org/'+name+'/latest',timeout=45) as response:data=json.load(response)
    reference[name]={'version':data['version'],'integrity':data['dist']['integrity']}
assert reference['esbuild']['version']=='0.28.2'
assert reference['npm']['version']==subprocess.check_output(['npm','--version'],text=True).strip()=='12.2.1'
entry=out/'actual-entry.ts'
entry.write_text('export { invokeLLM } from '+json.dumps(str(source/'server/_core/llm.ts'))+';\nexport { makeRequest } from '+json.dumps(str(source/'server/_core/map.ts'))+';\n')
command=[str(tools/'node_modules/.bin/esbuild'),str(entry),'--bundle','--platform=node','--target=node26','--format=cjs','--outfile='+str(out/'actual-adapters.cjs')]
run(command,owner,'actual-source-compile')
cases=subprocess.run(['node',str(owner/'.github/qualification/hulpgids-destination-cases.cjs')],capture_output=True,timeout=90)
(out/'case.stdout.log').write_bytes(cases.stdout);(out/'case.stderr.log').write_bytes(cases.stderr)
after_source=snapshot(source);after_owner=snapshot(owner)
assert before_source==after_source and before_owner==after_owner
report={'source_repository':'Robert-Velhorst/010-Nationale-Hulpgids-reach-out','source_head':'d2f7a31be1d0b41b12679a43d5cce5ad4bf55dfe',
        'source_before_and_after':before_source,'owner_before_and_after':before_owner,
        'compiler_command':command,'compiler_installed_graph':installed,'compiler_public_reference':reference,
        'compiler_raw_audit_exit_code':audit.returncode,'case_exit_code':cases.returncode,
        'application_package_installation_or_original_SDK_case_execution':False,
        'production_policy_or_source_changed':False,'full_security_SDK_application_deployment_or_data_acceptance':False}
(out/'source-compiler-and-cases.json').write_text(json.dumps(report,indent=2)+'\n')
(out/'compiler-package-lock.json').write_bytes((tools/'package-lock.json').read_bytes())
print(json.dumps({'source_payloads':len(before_source),'worker_owner_payloads':len(before_owner),'case_exit':cases.returncode,'installed_compiler_graph':installed}))
sys.exit(cases.returncode)
