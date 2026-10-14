const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGuards } = require('../billing/access');

test('resource actions use authenticated owner balance while management remains outside the gate', async () => {
  let enabled = true; let canUse = false;
  const service = { config: { get enabled() { return enabled; } }, summary: id => { assert.equal(id, 'owner'); return { canUse }; } };
  const guards = createGuards(() => service, async shareId => shareId === 'known' ? { userId: 'owner' } : null);
  let status; let proceeded = false;
  const res = { status: code => { status = code; return res; }, json: value => value };
  const next = () => { proceeded = true; };
  await guards.owner({ user: { _id: 'owner' } }, res, next);
  assert.equal(status, 402); assert.equal(proceeded, false);
  canUse = true; const req = { user: { _id: 'owner' } };
  await guards.owner(req, res, next); assert.equal(proceeded, true); assert.equal(req.resourceBilling, true);
  proceeded = false; canUse = false;
  await guards.guest({ params: { shareId: 'known' }, user: { _id: 'visitor' } }, res, next);
  assert.equal(status, 402); assert.equal(proceeded, false);
  enabled = false;
  await guards.owner({ user: { _id: 'owner' } }, res, next); assert.equal(proceeded, true);
});
