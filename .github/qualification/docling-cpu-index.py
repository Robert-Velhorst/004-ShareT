import hashlib,json,os,pathlib,re,subprocess
root=pathlib.Path(os.environ['GITHUB_WORKSPACE']);source=root/'hai';out=pathlib.Path(os.environ['RUNNER_TEMP'])/'docling-index-graph';out.mkdir()
r={'status':'started','scope':'public full graph metadata only; no application install, binary execution, tests or image build'}
try:
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()=='aa30aceeeaa53fa399b74673df1c92dc3afbd0ce'
 orig=(source/'services/docling-runner/requirements.in').read_text();assert all(s in orig for s in ['docling==2.142.0','pillow==13.0.0','certifi==2026.10.19','--extra-index-url https://download.pytorch.org/whl/cpu'])
 project='''[project]
name = "docling-index-qualification"
version = "0.0.0"
requires-python = ">=3.15"
dependencies = ["docling==2.145.0", "pillow==13.0.0", "certifi==2026.10.23"]

[tool.uv.sources]
torch = { index = "pytorch-cpu" }

[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true
'''
 (out/'pyproject.toml').write_text(project);r['original_input_sha256']=hashlib.sha256(orig.encode()).hexdigest();r['candidate_direct_versions']={'docling':'2.145.0','pillow':'13.0.0','certifi':'2026.10.23'}
 with (out/'resolution.log').open('wb') as log:proc=subprocess.run(['uv','pip','compile','pyproject.toml','--upgrade','--generate-hashes','--python-version','3.15','--python-platform','x86_64-unknown-linux-gnu','--prerelease','disallow','--output-file','requirements.lock'],cwd=out,stdout=log,stderr=subprocess.STDOUT,timeout=600)
 r['resolve_exit']=proc.returncode
 if proc.returncode:raise RuntimeError('explicit CPU index candidate did not resolve')
 lock=(out/'requirements.lock').read_text();r['selected']={n:(re.search(r'^'+n+r'==([^\s\\;]+)',lock,re.M).group(1) if re.search(r'^'+n+r'==([^\s\\;]+)',lock,re.M) else None) for n in ['torch','torchvision','docling','pillow','certifi','filelock']};r['gpu_package_records']=[line for line in lock.splitlines() if re.match(r'^(nvidia-|triton==)',line,re.I)];r['status']='resolved'
finally:(out/'result.json').write_text(json.dumps(r,indent=2))
