'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const checker = path.join(__dirname, '..', 'container-readiness.cjs');
const secret = 'OWNED_TEST_BODY_MUST_NOT_APPEAR_IN_DIAGNOSTICS';
const valid = { status: 'ready', database: { status: 'connected' } };

async function launch(port) {
  const child = spawn(process.execPath, [checker], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => { stdout += data; });
  child.stderr.on('data', (data) => { stderr += data; });
  const [code, signal] = await once(child, 'close');
  assert.equal(signal, null);
  assert.equal(stdout.includes(secret) || stderr.includes(secret), false);
  assert.ok(stdout.length + stderr.length < 512);
  return { code, stdout, stderr };
}

async function fixture(handler, run) {
  const server = http.createServer((req, res) => {
    assert.equal(req.url, '/ready');
    assert.equal(req.headers.accept, 'application/json');
    assert.equal(req.headers['accept-encoding'], 'identity');
    res.on('error', () => {});
    handler(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { return await run(server.address().port); }
  finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

test('accepts the explicit ready and connected JSON contract', async () => {
  await fixture((req, res) => json(res, valid), async (port) => {
    const result = await launch(port);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
  });
});

test('accepts valid chunked UTF-8 and case-insensitive JSON media type', async () => {
  const body = Buffer.from(JSON.stringify({ ...valid, note: 'caf\u00e9' }));
  const split = body.indexOf(Buffer.from('\u00e9')) + 1;
  await fixture((req, res) => {
    res.writeHead(200, { 'Content-Type': 'Application/JSON; charset=utf-8' });
    res.write(body.subarray(0, split));
    res.end(body.subarray(split));
  }, async (port) => assert.equal((await launch(port)).code, 0));
});

test('rejects HTTP 200 HTML from an SPA fallback without logging its body', async () => {
  await fixture((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>' + secret + '</html>'); }, async (port) => {
    const result = await launch(port);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /content-type/);
  });
});

for (const [name, value] of [
  ['not-ready', { status: 'not-ready', database: { status: 'connected' } }],
  ['initializing database', { status: 'ready', database: { status: 'initializing' } }],
  ['missing database', { status: 'ready' }],
  ['old liveness payload', { status: 'healthy', database: { status: 'connected' } }],
  ['array payload', [valid]],
  ['null payload', null],
]) {
  test('rejects ' + name + ' even with HTTP 200 JSON', async () => {
    await fixture((req, res) => json(res, value), async (port) => assert.equal((await launch(port)).code, 1));
  });
}

test('rejects non-success status even if its body claims readiness', async () => {
  await fixture((req, res) => json(res, valid, 503), async (port) => {
    const result = await launch(port);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /http/);
  });
});

test('rejects redirect without making a second request', async () => {
  let requests = 0;
  await fixture((req, res) => { requests++; res.writeHead(302, { Location: '/redirect-target' }); res.end(); }, async (port) => {
    assert.equal((await launch(port)).code, 1);
    assert.equal(requests, 1);
  });
});

test('rejects malformed JSON without echoing data', async () => {
  await fixture((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(secret); }, async (port) => {
    const result = await launch(port);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /invalid-json/);
  });
});

test('rejects invalid UTF-8 instead of accepting replacement characters', async () => {
  await fixture((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(Buffer.from([0xc3, 0x28])); }, async (port) => assert.equal((await launch(port)).code, 1));
});

test('rejects oversized declared responses before waiting for the body', async () => {
  await fixture((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1000000' }); res.end('{}'); }, async (port) => {
    const result = await launch(port);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /body-limit/);
  });
});

test('bounds chunked response bytes without relying on Content-Length', async () => {
  await fixture((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); res.end('x'.repeat(65536)); }, async (port) => {
    const result = await launch(port);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /body-limit/);
  });
});

test('rejects compressed responses instead of interpreting an unchecked body', async () => {
  await fixture((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }); res.end('{}'); }, async (port) => {
    const result = await launch(port);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /encoding/);
  });
});

test('applies a whole-request deadline to a continuously arriving body', { timeout: 15000 }, async () => {
  let interval;
  try {
    await fixture((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{');
      interval = setInterval(() => res.write(' '), 100);
      res.on('close', () => clearInterval(interval));
    }, async (port) => {
      const started = Date.now();
      const result = await launch(port);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /timeout/);
      assert.ok(Date.now() - started >= 7500);
      assert.ok(Date.now() - started < 13000);
    });
  } finally { clearInterval(interval); }
});

for (const port of ['0', '65536', '5005junk', 'https://example.invalid']) {
  test('rejects invalid port configuration ' + port, async () => {
    const result = await launch(port);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /configuration/);
  });
}
