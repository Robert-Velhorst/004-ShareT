const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { standardApiRateLimit, standardSharedRateLimit, apiRateLimit, sharedLinkRateLimit } = require('../utils/rateLimiter');

for (const [name, budget, transport, domain] of [
  ['API', 100, standardApiRateLimit, apiRateLimit],
  ['shared access', 30, standardSharedRateLimit, sharedLinkRateLimit],
]) {
  test(`${name} transport and domain limits reject the next request before the handler`, async t => {
    let handled = 0;
    const app = express();
    app.get('/', transport, domain, (_req, res) => { handled++; res.json({ ok: true }); });
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/`;
    for (let index = 0; index < budget; index++) {
      const response = await fetch(url);
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
    const response = await fetch(url);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
    await response.arrayBuffer();
    assert.equal(handled, budget);
  });
}
