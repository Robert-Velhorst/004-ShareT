import os,json,subprocess,hashlib,re
from pathlib import Path
root=Path(os.environ['GITHUB_WORKSPACE']); backend=root/'backend';out=Path(os.environ['RUNNER_TEMP'])/'backend-security-lock';out.mkdir()
r={'status':'started','scope':'lock-only; no application installation or tests'}
try:
 assert os.environ.get('GITHUB_ACTIONS')=='true' and not (backend/'node_modules').exists()
 package=json.loads((backend/'package.json').read_text());assert not ({'preinstall','install','postinstall','prepublish','preprepare','prepare','postprepare'} & set(package.get('scripts',{})))
 assert package['dependencies']['multer']=='^2.4.0'
 package['dependencies']['multer']='^2.5.0';(backend/'package.json').write_text(json.dumps(package,indent=2)+'\n')
 with (out/'resolution.log').open('wb') as log: result=subprocess.run(['npm','update','body-parser','multer','fast-uri','--package-lock-only'],cwd=backend,stdout=log,stderr=subprocess.STDOUT,timeout=600)
 r['resolve_exit']=result.returncode
 if result.returncode: raise RuntimeError('resolution failed')
 assert not (backend/'node_modules').exists()
 with (out/'audit.json').open('wb') as f: audit=subprocess.run(['npm','audit','--omit=dev','--json'],cwd=backend,stdout=f,stderr=subprocess.PIPE,timeout=180)
 r['audit_exit']=audit.returncode
 lock=json.loads((backend/'package-lock.json').read_text());r['versions']={x:lock['packages'].get('node_modules/'+x,{}).get('version') for x in ['body-parser','multer','fast-uri']}
 r['prereleases']=[{'path':k,'version':v.get('version')} for k,v in lock['packages'].items() if re.match(r'^\d+\.\d+\.\d+-',v.get('version',''))]
 (out/'package.json').write_bytes((backend/'package.json').read_bytes());(out/'package-lock.json').write_bytes((backend/'package-lock.json').read_bytes());r['status']='resolved'
finally:(out/'result.json').write_text(json.dumps(r,indent=2))
