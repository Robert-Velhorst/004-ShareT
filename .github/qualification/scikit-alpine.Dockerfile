FROM python:3.15.2-alpine3.24@sha256:20a82dbc2783112ddb91d1534603f802d222a3e63e593cd002eb2ac534e70211 AS build
RUN apk upgrade --no-cache && apk add --no-cache build-base gfortran openblas-dev linux-headers && addgroup -g 10001 builder && adduser -D -H -u 10001 -G builder builder
WORKDIR /build
COPY --chown=10001:10001 source/ /build/
RUN mkdir /out && chown 10001:10001 /out
USER 10001:10001
ENV HOME=/tmp PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m pip install --user --upgrade pip && python -m pip wheel --no-deps --wheel-dir /out .
FROM scratch AS export
COPY --from=build /out/ /
