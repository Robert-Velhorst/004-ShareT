FROM python:3.15.2-alpine3.24@sha256:20a82dbc2783112ddb91d1534603f802d222a3e63e593cd002eb2ac534e70211
RUN apk upgrade --no-cache && apk add --no-cache build-base gfortran openblas-dev linux-headers && addgroup -g 10001 tester && adduser -D -H -u 10001 -G tester tester
COPY requirements-test.lock /test-requirements.lock
COPY wheel-input/ /wheel-input/
RUN python -m pip install --upgrade pip && python -m pip install --require-hashes -r /test-requirements.lock && python -m pip install /wheel-input/scikit_learn-1.9.1-cp315-cp315-linux_x86_64.whl && python -m pip check
RUN python -c "import importlib.metadata as m; from pip._vendor.packaging.version import Version; bad=[(d.metadata['Name'],d.version) for d in m.distributions() if Version(d.version).is_prerelease]; print('Prerelease distributions:', bad); assert not bad"
WORKDIR /source
COPY --chown=10001:10001 source/ /source/
RUN python - <<'PY'
import hashlib, pathlib, zipfile
root = pathlib.Path('/source')
wheel = pathlib.Path('/wheel-input/scikit_learn-1.9.1-cp315-cp315-linux_x86_64.whl')
assert hashlib.sha256(wheel.read_bytes()).hexdigest() == '09b80c8c3b8d6b07c7dc2462b63b4b93d1143d193b2ed2a83a618b523cfaecde'
before = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
with zipfile.ZipFile(wheel) as z:
    extensions = [n for n in z.namelist() if n.startswith('sklearn/') and n.endswith('.so')]
    assert extensions and any(n.startswith('sklearn/__check_build/_check_build') for n in extensions)
    assert len(extensions) == len(set(extensions))
    for name in extensions:
        parts = pathlib.PurePosixPath(name).parts
        assert '..' not in parts
        target = root.joinpath(*parts)
        assert not target.exists()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(z.read(name))
after = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
assert all(after.get(name) == digest for name, digest in before.items())
assert set(after) - set(before) == set(extensions)
print('Added verified wheel extensions:', len(extensions), 'preserved source files:', len(before))
PY
RUN chown -R 10001:10001 /source
USER 10001:10001
ENV HOME=/tmp
RUN pytest
