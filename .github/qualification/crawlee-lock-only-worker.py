"""Resolve the publisher port lock metadata on a disposable hosted worker."""
import hashlib,json,os,subprocess
from pathlib import Path
root=Path(os.environ['GITHUB_WORKSPACE']);repo=root/'crawlee';out=Path(os.environ['RUNNER_TEMP'])/'crawlee-lock-resolution';out.mkdir(exist_ok=False)
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_OS')=='Linux'
def run(args): return subprocess.check_output(args,cwd=repo,text=True).strip()
def snapshot():
 paths=subprocess.check_output(['git','ls-files','-z'],cwd=repo).decode().split('\0')
 return {x:hashlib.sha256((repo/x).read_bytes()).hexdigest() for x in paths if x and (repo/x).is_file()}
report={'scope':'Lock metadata resolution only. No publisher tests, application install, production or deployment acceptance.','status':'started'}
try:
 assert run(['git','rev-parse','HEAD'])=='96ed398b26954f0e7818cc862f33ff4bb706c84b'
 assert not run(['git','status','--porcelain']) and not (repo/'node_modules').exists()
 assert run(['node','--version'])=='v26.13.0' and run(['yarn','--version'])=='4.10.3'
 before=snapshot();subprocess.run(['git','apply','--check',str(root/'.github/qualification/crawlee-stable-cheerio.patch')],cwd=repo,check=True);subprocess.run(['git','apply',str(root/'.github/qualification/crawlee-stable-cheerio.patch')],cwd=repo,check=True)
 with (out/'resolution.log').open('wb') as log:result=subprocess.run(['yarn','install','--mode=update-lockfile'],cwd=repo,stdout=log,stderr=subprocess.STDOUT,timeout=1200)
 report['returncode']=result.returncode
 if result.returncode:raise RuntimeError('Publisher lock resolution failed')
 assert not (repo/'node_modules').exists(), 'Lock-only mode unexpectedly linked dependencies'
 after=snapshot();assert set(before)==set(after);changed=[k for k in before if before[k]!=after[k]]
 expected={'packages/'+n+'/package.json' for n in ['cheerio-crawler','http-crawler','jsdom-crawler','linkedom-crawler','playwright-crawler','puppeteer-crawler','utils']}
 expected|={'packages/utils/src/internals/cheerio.ts','packages/playwright-crawler/src/internals/adaptive-playwright-crawler.ts','yarn.lock'}
 assert set(changed)==expected,(changed,sorted(expected));data=(repo/'yarn.lock').read_bytes();(out/'yarn.lock').write_bytes(data)
 report.update(status='resolved',changed=changed,unchanged_source_files=len(before)-len(changed),lock_sha256=hashlib.sha256(data).hexdigest(),publisher_tests_run=False)
finally:(out/'result.json').write_text(json.dumps(report,indent=2))
