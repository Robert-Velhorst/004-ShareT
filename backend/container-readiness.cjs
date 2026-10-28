'use strict';

const http = require('node:http');
const MAX_BODY_BYTES = 64 * 1024;
// Leave time for process startup and cleanup inside Docker's 10-second limit.
const DEADLINE_MS = 8000;

function check(port) {
  return new Promise((resolve) => {
    let complete = false;
    let request;
    let response;
    const deadline = setTimeout(() => finish(false, 'timeout'), DEADLINE_MS);

    function finish(ok, reason) {
      if (complete) return;
      complete = true;
      clearTimeout(deadline);
      if (response) response.destroy();
      if (request) request.destroy();
      resolve({ ok, reason });
    }

    request = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/ready',
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
    }, (incoming) => {
      response = incoming;
      incoming.on('error', () => finish(false, 'network'));
      incoming.on('aborted', () => finish(false, 'network'));
      if (incoming.statusCode !== 200) return finish(false, 'http');
      const type = incoming.headers['content-type'];
      if (typeof type !== 'string' || type.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return finish(false, 'content-type');
      }
      const encoding = incoming.headers['content-encoding'];
      if (encoding && String(encoding).trim().toLowerCase() !== 'identity') return finish(false, 'encoding');
      const declaredLength = incoming.headers['content-length'];
      if (typeof declaredLength === 'string' && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_BODY_BYTES) {
        return finish(false, 'body-limit');
      }
      let size = 0;
      const chunks = [];
      incoming.on('data', (chunk) => {
        if (complete) return;
        size += chunk.length;
        if (size > MAX_BODY_BYTES) return finish(false, 'body-limit');
        chunks.push(chunk);
      });
      incoming.on('end', () => {
        if (complete) return;
        try {
          const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size));
          const value = JSON.parse(decoded);
          const ready = value !== null && typeof value === 'object' && !Array.isArray(value)
            && value.status === 'ready' && value.database !== null
            && typeof value.database === 'object' && !Array.isArray(value.database)
            && value.database.status === 'connected';
          finish(ready, ready ? undefined : 'not-ready');
        } catch {
          finish(false, 'invalid-json');
        }
      });
    });
    request.on('error', () => finish(false, 'network'));
  });
}

const configuredPort = process.env.PORT || '5005';
if (!/^\d{1,5}$/.test(configuredPort) || Number(configuredPort) < 1 || Number(configuredPort) > 65535) {
  process.stderr.write('readiness check failed: configuration\n');
  process.exitCode = 1;
} else {
  check(Number(configuredPort)).then(({ ok, reason }) => {
    if (!ok) {
      process.stderr.write(`readiness check failed: ${reason}\n`);
      process.exitCode = 1;
    }
  });
}
