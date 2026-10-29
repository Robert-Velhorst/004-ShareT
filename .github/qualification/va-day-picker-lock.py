import os,json,subprocess,hashlib,re
from pathlib import Path
root=Path(os.environ['GITHUB_WORKSPACE']);repo=root/'va-dashboard';out=Path(os.environ['RUNNER_TEMP'])/'va-day-picker-lock';out.mkdir()
r={'status':'started','scope':'pnpm lock metadata only, no dependency installation, application execution or tests'}
def snap():
 paths=subprocess.check_output(['git','ls-files','-z'],cwd=repo).decode().split('\0');return {p:hashlib.sha256((repo/p).read_bytes()).hexdigest() for p in paths if p and (repo/p).is_file()}
try:
 assert os.environ.get('GITHUB_ACTIONS')=='true'
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()=='b55233fb2a947291f0ca08d5952049c598b933ac'
 assert not (repo/'node_modules').exists() and not (repo/'.pnpmfile.cjs').exists() and not (repo/'pnpmfile.cjs').exists()
 f=repo/'package.json';text=f.read_text();package=json.loads(text);assert package['dependencies']['react-day-picker']=='^9.11.1';assert not ({'preinstall','install','postinstall','prepublish','preprepare','prepare','postprepare'} & set(package.get('scripts',{})))
 before=snap();guard=root/'.github/qualification/va-pnpm-stability.py';baseline=subprocess.run(['python3',str(guard)],cwd=repo,capture_output=True,text=True);(out/'baseline-stability.txt').write_text(baseline.stdout+baseline.stderr);assert baseline.returncode==1 and 'date-fns-jalali@4.1.0-0' in baseline.stderr;old='"react-day-picker": "^9.11.1"';new='"react-day-picker": "^10.0.2"';assert text.count(old)==1;f.write_text(text.replace(old,new))
 with (out/'resolution.log').open('wb') as log:result=subprocess.run(['pnpm','install','--lockfile-only'],cwd=repo,stdout=log,stderr=subprocess.STDOUT,timeout=600)
 r['resolve_exit']=result.returncode
 if result.returncode:raise RuntimeError('lock resolution failed')
 assert not (repo/'node_modules').exists();after=snap();assert set(before)==set(after);changed=[k for k in before if before[k]!=after[k]];assert set(changed)=={'package.json','pnpm-lock.yaml'},changed
 candidate=subprocess.run(['python3',str(guard)],cwd=repo,capture_output=True,text=True);(out/'candidate-stability.txt').write_text(candidate.stdout+candidate.stderr);r['semantic_stability_exit']=candidate.returncode;assert candidate.returncode==0
 lock=(repo/'pnpm-lock.yaml').read_text();r['prerelease_record_lines']=[line.strip() for line in lock.splitlines() if re.match(r'^  [^ ]',line) and re.search(r'@\d+\.\d+\.\d+-(?:alpha|beta|rc|next|dev|pre|\d)',line,re.I)];r['jalali_present']='date-fns-jalali@' in lock;r['changed']=changed;r['unchanged_tracked_files']=len(before)-len(changed);r['tests_run']=False
 (out/'package.json').write_bytes(f.read_bytes());(out/'pnpm-lock.yaml').write_bytes((repo/'pnpm-lock.yaml').read_bytes());r['status']='resolved'
finally:(out/'result.json').write_text(json.dumps(r,indent=2))
