"""Fresh npm lock resolution with original publisher locks preserved as evidence."""
import hashlib,json,os,subprocess,shutil
from pathlib import Path
root=Path(os.environ['GITHUB_WORKSPACE']).resolve();repo=root/'browserbase';out=Path(os.environ['RUNNER_TEMP'])/'browserbase-lock-resolution';out.mkdir(exist_ok=False)
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_OS')=='Linux'
def run(args):return subprocess.check_output(args,cwd=repo,text=True).strip()
def snap():
 paths=subprocess.check_output(['git','ls-files','-z'],cwd=repo).decode().split('\0')
 return {x:hashlib.sha256((repo/x).read_bytes()).hexdigest() for x in paths if x and (repo/x).is_file()}
report={'status':'started','scope':'Fresh npm lock metadata with both original locks preserved; no SDK installation or publisher tests.'}
try:
 assert repo.resolve().parent.name not in {'node_modules','tmp','.tmp'}
 assert run(['git','rev-parse','HEAD'])=='847f5820bb577eea789c6cb21244e47660011eb2' and not run(['git','status','--porcelain'])
 assert run(['node','--version'])=='v26.13.0' and run(['npm','--version'])=='12.2.1' and not (repo/'node_modules').exists()
 before=snap();package=json.loads((repo/'package.json').read_text());assert package['scripts']['prepare']=='if ./scripts/utils/check-is-in-git-install.sh; then ./scripts/build && ./scripts/utils/git-swap.sh; fi'
 patch=root/'.github/qualification/browserbase-multipart-stable.patch';subprocess.run(['git','apply','--check',str(patch)],cwd=repo,check=True);subprocess.run(['git','apply',str(patch)],cwd=repo,check=True)
 for f in ('package-lock.json','yarn.lock'):
  (repo/f).replace(out/('original-'+f))
 with (out/'resolution.log').open('wb') as log:res=subprocess.run(['npm','install','--package-lock-only'],cwd=repo,stdout=log,stderr=subprocess.STDOUT,timeout=900)
 report['returncode']=res.returncode
 if res.returncode:raise RuntimeError('fresh npm lock resolution failed')
 assert not (repo/'node_modules').exists() and not (repo/'yarn.lock').exists()
 shutil.copyfile(out/'original-yarn.lock',repo/'yarn.lock');after=snap();assert set(before)==set(after)
 changed=[k for k in before if before[k]!=after[k]];assert set(changed)=={'package.json','package-lock.json','src/_shims/node-runtime.ts'},changed
 lock=json.loads((repo/'package-lock.json').read_text());pk=lock['packages'];assert pk['node_modules/formdata-node']['version']=='6.0.3' and pk['node_modules/form-data-encoder']['version']=='4.1.0'
 with (out/'audit.json').open('wb') as audit_log:audit=subprocess.run(['npm','audit','--json'],cwd=repo,stdout=audit_log,stderr=subprocess.PIPE,timeout=300)
 report['audit_exit_code']=audit.returncode
 try:report['audit_metadata']=json.loads((out/'audit.json').read_text()).get('metadata',{})
 except (json.JSONDecodeError,OSError):report['audit_unavailable']=True
 assert snap()==after
 for f in ('package.json','package-lock.json'):(out/('candidate-'+f)).write_bytes((repo/f).read_bytes())
 report.update(status='resolved',changed=changed,unchanged_files=len(before)-len(changed),original_yarn_preserved=True,publisher_tests_run=False)
finally:(out/'result.json').write_text(json.dumps(report,indent=2))
