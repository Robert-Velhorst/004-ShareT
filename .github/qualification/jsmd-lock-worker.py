"""Resolve jsmd publisher lock metadata on an isolated hosted worker."""
import hashlib,json,os,subprocess
from pathlib import Path
root=Path(os.environ['GITHUB_WORKSPACE']).resolve();repo=root/'jsmd';out=Path(os.environ['RUNNER_TEMP'])/'jsmd-lock-resolution';out.mkdir(exist_ok=False)
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_OS')=='Linux'
def run(args):return subprocess.check_output(args,cwd=repo,text=True).strip()
def snap():
 paths=subprocess.check_output(['git','ls-files','-z'],cwd=repo).decode().split('\0')
 return {x:hashlib.sha256((repo/x).read_bytes()).hexdigest() for x in paths if x and (repo/x).is_file()}
report={'status':'started','scope':'Publisher lock metadata only; no SDK installation or tests.'}
try:
 assert run(['git','rev-parse','HEAD'])=='8aad62e41d8aecf56a684a7322e46813c336d45d' and not run(['git','status','--porcelain'])
 assert run(['node','--version'])=='v26.13.0' and run(['npm','--version'])=='12.2.1' and not (repo/'node_modules').exists()
 package=json.loads((repo/'package.json').read_text());assert not ({'preinstall','install','postinstall','prepublish','preprepare','prepare','postprepare'} & set(package.get('scripts',{})))
 before=snap();(out/'original-package-lock.json').write_bytes((repo/'package-lock.json').read_bytes());patch=root/'.github/qualification/jsmd-marked.patch';subprocess.run(['git','apply','--check',str(patch)],cwd=repo,check=True);subprocess.run(['git','apply',str(patch)],cwd=repo,check=True)
 with (out/'resolution.log').open('wb') as log:res=subprocess.run(['npm','install','--package-lock-only'],cwd=repo,stdout=log,stderr=subprocess.STDOUT,timeout=900)
 report['returncode']=res.returncode
 if res.returncode:raise RuntimeError('publisher lock resolution failed')
 assert not (repo/'node_modules').exists();after=snap();assert set(before)==set(after);changed=[k for k in before if before[k]!=after[k]];assert set(changed)=={'package.json','package-lock.json'},changed
 lock=json.loads((repo/'package-lock.json').read_text());assert lock['packages']['node_modules/marked']['version']=='18.1.2'
 with (out/'audit.json').open('wb') as log:audit=subprocess.run(['npm','audit','--json'],cwd=repo,stdout=log,stderr=subprocess.PIPE,timeout=300)
 report['audit_exit_code']=audit.returncode;assert snap()==after
 (out/'candidate-package-lock.json').write_bytes((repo/'package-lock.json').read_bytes());report.update(status='resolved',changed=changed,unchanged_files=len(before)-len(changed),publisher_tests_run=False)
finally:(out/'result.json').write_text(json.dumps(report,indent=2))
