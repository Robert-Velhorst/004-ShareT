'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.equal(process.env.GITHUB_REPOSITORY, 'Robert-Velhorst/004-ShareT');
assert.equal(process.version, 'v26.13.0');
const output = path.join(process.env.RUNNER_TEMP, 'sharet-support-health');
const original = fs.readFileSync(path.join(output, 'original-support-bundle.cjs'), 'utf8');
const candidate = fs.readFileSync('scripts/support-bundle.cjs', 'utf8');
const observations = [];

function sourceFunction(source) {
  const start = source.indexOf('async function readHealth() {');
  const end = source.indexOf('\nasync function main()', start);
  assert(start >= 0 && end > start);
  const body = source.slice(start, end).trim();
  assert(body.endsWith('}'));
  return body;
}

function load(source, port, fetchImpl = fetch) {
  // Test only the exact application function bytes. Its top-level env loading,
  // filesystem/report creation and main invocation are deliberately not run.
  return vm.runInNewContext('(' + sourceFunction(source) + ')', {
    process: { env: port === undefined ? {} : { PORT: port } },
    fetch: fetchImpl, AbortSignal, URL
  }, { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } });
}

async function server(handler) {
  const instance = http.createServer(handler);
  await new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(0, '127.0.0.1', resolve);
  });
  return instance;
}

async function close(instance) {
  instance.closeAllConnections();
  await new Promise(resolve => instance.close(resolve));
}

async function compare(source, label) {
  const results = [];
  const record = async (name, callback) => {
    try { await callback(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  };
  let mode = 'json';
  let primaryHits = [];
  let secondaryHits = 0;
  const secondary = await server((req, res) => {
    secondaryHits++;
    res.setHeader('content-type', 'application/json');
    res.end('{"target":"secondary"}');
  });
  const primary = await server((req, res) => {
    primaryHits.push(req.url);
    if (mode === 'redirect-other') {
      res.writeHead(302, { location: 'http://127.0.0.1:' + secondary.address().port + '/ready' });
      res.end();
    } else if (mode === 'redirect-path' && req.url === '/ready') {
      res.writeHead(302, { location: '/different' }); res.end();
    } else if (mode === 'invalid-json') {
      res.end('not-json');
    } else {
      res.writeHead(mode === 'unready' ? 503 : 200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"unicode":"café"}');
    }
  });
  const port = String(primary.address().port);
  try {
    await record('ordinary-ready-json', async () => {
      const result = await load(source, port)();
      assert.equal(result.reachable, true); assert.equal(result.status, 200);
      assert.equal(result.body.unicode, 'café');
      assert.deepEqual(primaryHits, ['/ready']);
    });
    await record('unready-json-status-preserved', async () => {
      mode = 'unready'; primaryHits = [];
      const result = await load(source, port)();
      assert.equal(result.reachable, true); assert.equal(result.status, 503);
      assert.deepEqual(primaryHits, ['/ready']);
    });
    await record('invalid-json-remains-unreachable', async () => {
      mode = 'invalid-json'; primaryHits = [];
      assert.equal((await load(source, port)()).reachable, false);
      assert.deepEqual(primaryHits, ['/ready']);
    });
    await record('credential-url-already-rejected-by-native-fetch', async () => {
      mode = 'json'; secondaryHits = 0; primaryHits = [];
      const result = await load(source, port + '@127.0.0.1:' + secondary.address().port)();
      assert.equal(result.reachable, false);
      assert.equal(secondaryHits, 0); assert.equal(primaryHits.length, 0);
    });
    await record('configured-port-cannot-inject-path', async () => {
      mode = 'json'; primaryHits = [];
      const result = await load(source, port + '/different?')();
      observations.push({ label, case: 'path-injection', reachable: result.reachable, request_paths: [...primaryHits] });
      assert.equal(result.reachable, false); assert.equal(primaryHits.length, 0);
    });
    await record('health-redirect-cannot-change-destination', async () => {
      mode = 'redirect-other'; primaryHits = []; secondaryHits = 0;
      const result = await load(source, port)();
      observations.push({ label, case: 'redirect-other-port', reachable: result.reachable, secondary_requests: secondaryHits });
      assert.equal(result.reachable, false); assert.equal(secondaryHits, 0);
      assert.deepEqual(primaryHits, ['/ready']);
    });
    await record('health-redirect-cannot-change-path', async () => {
      mode = 'redirect-path'; primaryHits = [];
      const result = await load(source, port)();
      assert.equal(result.reachable, false); assert.deepEqual(primaryHits, ['/ready']);
    });
  } finally {
    await close(primary); await close(secondary);
  }
  for (const [name, value] of [['unset-default', undefined], ['empty-default', ''], ['lower-bound', '1'], ['upper-bound', '65535'], ['leading-zero-decimal', '05005']]) {
    await record(name, async () => {
      const calls = [];
      const result = await load(source, value, async (url, options) => {
        calls.push({ url: new URL(url), options });
        return { status: 200, json: async () => ({ ok: true }) };
      })();
      assert.equal(result.reachable, true); assert.equal(calls.length, 1);
      const url = calls[0].url;
      assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1');
      assert.equal(url.pathname, '/ready'); assert.equal(url.search, ''); assert.equal(url.hash, '');
      assert.equal(Number(url.port || '80'), Number(value || '5005'));
    });
  }
  if (label === 'candidate') {
    const bad = ['0', '65536', '-1', '+5005', ' 5005', '5005 ', '5e3', '5005.0', '0x138d', '5005/path',
      '5005?query', '5005#fragment', '5005@host.invalid', '5005\\path', '5005\n', '5005%2fpath', '100000'];
    for (const value of bad) {
      await record('invalid-port-' + bad.indexOf(value), async () => {
        let calls = 0;
        const result = await load(source, value, async () => { calls++; throw new Error('must not fetch'); })();
        assert.equal(result.reachable, false); assert.equal(calls, 0);
        assert.equal(result.error, 'PORT must be a decimal integer between 1 and 65535');
      });
    }
  }
  return { label, cases: results, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length };
}

(async () => {
  const baseline = await compare(original, 'original');
  const changed = await compare(candidate, 'candidate');
  const expectedFailures = ['configured-port-cannot-inject-path', 'health-redirect-cannot-change-destination', 'health-redirect-cannot-change-path'];
  assert.deepEqual(baseline.cases.filter(r => !r.passed).map(r => r.name), expectedFailures);
  const result = { actual_Node: process.version, baseline, candidate: changed, observations,
    original_application_function_sha256: crypto.createHash('sha256').update(sourceFunction(original)).digest('hex'),
    candidate_application_function_sha256: crypto.createHash('sha256').update(sourceFunction(candidate)).digest('hex'),
    skipped_cases: 0, arbitrary_remote_SSRF_proven: false, credential_authority_form_did_not_make_network_requests: true,
    no_database_or_operator_or_external_provider_access: true };
  fs.writeFileSync(path.join(output, 'case-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ original_pass: baseline.passed, original_security_failures: baseline.failed,
    candidate_pass: changed.passed, candidate_fail: changed.failed, skipped: 0 }));
  assert.equal(changed.failed, 0);
})().catch(error => { console.error(error); process.exitCode = 1; });
