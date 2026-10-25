FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797
RUN npm install --global npm@12.2.1 --ignore-scripts --no-audit
USER 1000:1000
ENV SHARET_PUBLIC_LOCK_SDK=github-hosted
ENTRYPOINT ["node", "/inputs/prepare-stable-lock-metadata.cjs"]
