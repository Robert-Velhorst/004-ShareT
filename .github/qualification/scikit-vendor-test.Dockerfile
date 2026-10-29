FROM python:3.15.2-alpine3.24@sha256:20a82dbc2783112ddb91d1534603f802d222a3e63e593cd002eb2ac534e70211
RUN apk upgrade --no-cache && apk add --no-cache build-base gfortran openblas-dev linux-headers && addgroup -g 10001 tester && adduser -D -H -u 10001 -G tester tester
COPY requirements-test.lock /test-requirements.lock
COPY wheel-input/ /wheel-input/
RUN python -m pip install --upgrade pip && python -m pip install --require-hashes -r /test-requirements.lock && python -m pip install /wheel-input/scikit_learn-1.9.1-cp315-cp315-linux_x86_64.whl && python -m pip check
RUN python -c "import importlib.metadata as m; from pip._vendor.packaging.version import Version; bad=[(d.metadata['Name'],d.version) for d in m.distributions() if Version(d.version).is_prerelease]; print('Prerelease distributions:', bad); assert not bad"
WORKDIR /source
COPY --chown=10001:10001 source/ /source/
RUN chown 10001:10001 /source
USER 10001:10001
ENV HOME=/tmp
RUN pytest
