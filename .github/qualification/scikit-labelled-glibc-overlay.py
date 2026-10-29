import hashlib, json, os, pathlib, zipfile

base = pathlib.Path(os.environ['RUNNER_TEMP']) / 'scikit-source-build'
source = base / 'source'
wheel, = (base / 'wheel-input').glob('*.whl')
assert hashlib.sha256(wheel.read_bytes()).hexdigest() == '8fdf43ea52e38a98e5d61e5bf749df35adac2c9fb2255e1301d15aae3274f9cf'
before = {p.relative_to(source).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob('*') if p.is_file()}
with zipfile.ZipFile(wheel) as z:
    extensions = [n for n in z.namelist() if n.startswith('sklearn/') and n.endswith('.so')]
    assert extensions and any(n.startswith('sklearn/__check_build/_check_build') for n in extensions)
    assert len(set(extensions)) == len(extensions)
    for name in extensions:
        parts = pathlib.PurePosixPath(name).parts
        assert '..' not in parts
        target = source.joinpath(*parts); assert not target.exists(); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(z.read(name))
after = {p.relative_to(source).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob('*') if p.is_file()}
assert all(after.get(n) == h for n, h in before.items()) and set(after) - set(before) == set(extensions)
(base / 'overlay-identity.json').write_text(json.dumps({'wheel_sha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),'source_files_preserved':len(before),'extensions_added':len(extensions)},indent=2))
