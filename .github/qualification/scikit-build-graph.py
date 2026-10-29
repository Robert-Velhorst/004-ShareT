import os,pathlib,hashlib,tarfile,io,urllib.request,subprocess,json,tomllib
root=pathlib.Path(os.environ['GITHUB_WORKSPACE']);out=pathlib.Path(os.environ['RUNNER_TEMP'])/'scikit-build-graph';out.mkdir()
r={'status':'started','scope':'build-requirements metadata resolution only; no vendor build or tests'}
try:
 url='https://files.pythonhosted.org/packages/d2/eb/eaf5e07fcc0da7149b0e084f24e54edd7441b9a89ce7e034032ae97fe3a0/scikit_learn-1.9.1.tar.gz'
 with urllib.request.urlopen(url,timeout=90) as response: raw=response.read(9*1024*1024)
 assert hashlib.sha256(raw).hexdigest()=='629cada3e33e2b9bf376cdc7614a47a4140b8aedc1d836579e359736fbd82977'
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:
  matches=[m for m in archive if m.isfile() and m.name=='scikit_learn-1.9.1/pyproject.toml'];assert len(matches)==1;source=archive.extractfile(matches[0]).read()
 (out/'pyproject.toml').write_bytes(source);before=tomllib.loads(source.decode())['build-system']['requires'];patch=root/'.github/qualification/scikit-toolchain.patch';subprocess.run(['git','apply','--check',str(patch)],cwd=out,check=True);subprocess.run(['git','apply',str(patch)],cwd=out,check=True)
 after=tomllib.loads((out/'pyproject.toml').read_text())['build-system']['requires'];assert len(before)==len(after) and before[2:]==after[2:] and after[:2]==['meson-python>=0.22.1','cython>=3.3.0']
 (out/'requirements-build.in').write_text('\n'.join(after)+'\n');r.update(source_sha256=hashlib.sha256(raw).hexdigest(),before=before,after=after)
 with (out/'resolution.log').open('wb') as log:proc=subprocess.run(['uv','pip','compile','requirements-build.in','--upgrade','--generate-hashes','--python-version','3.15','--python-platform','x86_64-unknown-linux-musl','--prerelease','disallow','--output-file','requirements-build.lock'],cwd=out,stdout=log,stderr=subprocess.STDOUT,timeout=600)
 r['resolve_exit']=proc.returncode
 if proc.returncode:raise RuntimeError('candidate build graph did not resolve')
 r['status']='resolved';r['vendor_build_run']=False;r['vendor_tests_run']=False
finally:(out/'result.json').write_text(json.dumps(r,indent=2))
