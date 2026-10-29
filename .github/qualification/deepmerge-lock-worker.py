"""Inspect a publisher source port and resolve its lock without installing it."""
import hashlib,json,os,subprocess
from pathlib import Path
root=Path(os.environ['GITHUB_WORKSPACE']).resolve();repo=root/'deepmerge';out=Path(os.environ['RUNNER_TEMP'])/'deepmerge-lock-resolution';out.mkdir(exist_ok=False)
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_OS')=='Linux'
def run(args):return subprocess.check_output(args,cwd=repo,text=True).strip()
def snap():
 paths=subprocess.check_output(['git','ls-files','-z'],cwd=repo).decode().split('\0')
 return {x:hashlib.sha256((repo/x).read_bytes()).hexdigest() for x in paths if x and (repo/x).is_file()}
report={'status':'started','scope':'Publisher lock metadata only; original tests not run.'}
try:
 assert run(['git','rev-parse','HEAD'])=='5b87756a5671635679001cbac72aa42f23472c81' and not run(['git','status','--porcelain'])
 assert run(['node','--version'])=='v26.13.0' and run(['npm','--version'])=='12.2.1' and not (repo/'node_modules').exists()
 package=json.loads((repo/'package.json').read_text());assert not ({'preinstall','install','postinstall','prepublish','preprepare','prepare','postprepare'} & set(package.get('scripts',{})))
 before=snap();(out/'original-package-lock.json').write_bytes((repo/'package-lock.json').read_bytes());patch=root/'.github/qualification/deepmerge-own-property.patch';subprocess.run(['git','apply','--check',str(patch)],cwd=repo,check=True);subprocess.run(['git','apply',str(patch)],cwd=repo,check=True)
 with (out/'resolution.log').open('wb') as log:res=subprocess.run(['npm','install','--package-lock-only'],cwd=repo,stdout=log,stderr=subprocess.STDOUT,timeout=900)
 report['returncode']=res.returncode
 if res.returncode:raise RuntimeError('publisher lock resolution failed')
 assert not (repo/'node_modules').exists();after=snap();assert set(before)==set(after);changed=[k for k in before if before[k]!=after[k]];assert set(changed) in ({'index.js','package.json','rollup.config.js'}, {'index.js','package.json','rollup.config.js','package-lock.json'}),changed
 assert (repo/'test/prototype-own-key-regression.js').is_file()
 with (out/'audit.json').open('wb') as log:audit=subprocess.run(['npm','audit','--json'],cwd=repo,stdout=log,stderr=subprocess.PIPE,timeout=300)
 report['audit_exit_code']=audit.returncode;assert snap()==after
 (out/'candidate-package-lock.json').write_bytes((repo/'package-lock.json').read_bytes());report.update(status='resolved',changed=changed,unchanged_files=len(before)-len(changed),publisher_tests_run=False)
finally:(out/'result.json').write_text(json.dumps(report,indent=2))
