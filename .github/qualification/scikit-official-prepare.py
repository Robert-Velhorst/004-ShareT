import hashlib, io, json, os, pathlib, subprocess, tarfile, urllib.request, zipfile

out = pathlib.Path(os.environ['RUNNER_TEMP']) / 'scikit-official-glibc'
out.mkdir()
source = out / 'source'
source.mkdir()
def download(url, limit, expected):
    with urllib.request.urlopen(url, timeout=90) as response:
        raw = response.read(limit)
    assert hashlib.sha256(raw).hexdigest() == expected
    return raw
raw = download('https://files.pythonhosted.org/packages/d2/eb/eaf5e07fcc0da7149b0e084f24e54edd7441b9a89ce7e034032ae97fe3a0/scikit_learn-1.9.1.tar.gz', 9*1024*1024, '629cada3e33e2b9bf376cdc7614a47a4140b8aedc1d836579e359736fbd82977')
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
    members = archive.getmembers()
    assert len(members) == 1550
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        assert member.isfile() and path.parts[0] == 'scikit_learn-1.9.1' and '..' not in path.parts
        target = source.joinpath(*path.parts[1:]); target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.extractfile(member).read())
original = {p.relative_to(source).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob('*') if p.is_file()}
patch = pathlib.Path(os.environ['GITHUB_WORKSPACE']) / '.github/qualification/scikit-arff.patch'
subprocess.run(['git', 'apply', '--check', str(patch)], cwd=source, check=True)
subprocess.run(['git', 'apply', str(patch)], cwd=source, check=True)
modified = {p.relative_to(source).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob('*') if p.is_file()}
assert set(original) == set(modified) and {p for p in original if original[p] != modified[p]} == {'sklearn/datasets/_arff_parser.py'}
name = 'scikit_learn-1.9.1-cp315-cp315-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl'
wheel = download('https://files.pythonhosted.org/packages/47/bb/98a31f10fffbd39edcc2f8bf4119b29652248bb110b7d45c84e68aa293ab/' + name, 12*1024*1024, '6754b7cabfc3df0b1f7b38f7a344f559bbae9d82f0ac5e3d48cccbd19fdcefdf')
(out / name).write_bytes(wheel)
before = {p.relative_to(source).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob('*') if p.is_file()}
with zipfile.ZipFile(io.BytesIO(wheel)) as archive:
    additions = [n for n in archive.namelist() if (n.startswith('sklearn/') and n.endswith('.so')) or (n.startswith('scikit_learn.libs/') and not n.endswith('/'))]
    assert additions and len(set(additions)) == len(additions)
    for name in additions:
        parts = pathlib.PurePosixPath(name).parts
        assert '..' not in parts
        target = source.joinpath(*parts); assert not target.exists(); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(archive.read(name))
after = {p.relative_to(source).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob('*') if p.is_file()}
assert all(after.get(n) == h for n,h in before.items()) and set(after)-set(before) == set(additions)
(out/'identity.json').write_text(json.dumps({'source_files_preserved':len(before),'wheel_native_additions':len(additions),'source_sha256':hashlib.sha256(raw).hexdigest(),'wheel_sha256':hashlib.sha256(wheel).hexdigest(),'scope':'ARFF source patch and original publisher native modules; vendor tests unchanged'},indent=2))
