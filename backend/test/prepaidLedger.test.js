const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Ledger } = require('../billing/ledger');
const { priceUsage, validateRateCard } = require('../billing/pricing');
const { acquireWriterLock } = require('../billing/writerLock');

const rates = { version: 'invoice-1', currency: 'eur', source: 'Supplier invoice 123', rates: {
  cpu: { unit: 'cpu-second', eurPerUnit: '0.004' },
  ram: { unit: 'GB-second', eurPerUnit: '0.000001' }
} };
const receipt = (id = 'usage-1') => ({ id, userId: 'alice', rateVersion: rates.version,
  source: 'tenant-container', evidence: 'counter-range-1', startedAt: '2026-09-04T10:00:00Z',
  endedAt: '2026-09-04T11:00:00Z', lines: [{ resource: 'cpu', quantity: '2.5' }] });
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharet-wallet-'));
  const file = path.join(dir, 'billing.sqlite');
  const ledger = new Ledger(file);
  t.after(() => { ledger.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { ledger, file };
}
function fund(ledger, id = 'order-1', amount = 1000) {
  ledger.createOrder({ id, userId: 'alice', amountCents: amount });
  ledger.reconcileOrder(id, { paid: true, refundedCents: 0, hold: false, lost: false, paymentIntent: 'pi_' + id });
}
test('a second runtime writer is refused until the first releases its database lock', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharet-writer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'writer.sqlite');
  const lock = acquireWriterLock(file);
  try { assert.throws(() => acquireWriterLock(file), /writer/); }
  finally { lock.close(); }
  acquireWriterLock(file).close();
});
test('rates use exact decimals and the 2.5 multiplier without rounding up each tiny request', () => {
  assert.equal(priceUsage(receipt(), rates).chargeNanos, 25000000);
  assert.equal(priceUsage(receipt(), rates).baseNanos, 10000000);
  const tiny = { ...receipt(), lines: [{ resource: 'ram', quantity: '0.001' }] };
  assert.equal(priceUsage(tiny, rates).chargeNanos, 2);
});
test('unknown, negative, excessive, malformed and mismatched usage fails closed', () => {
  for (const quantity of ['-1', 'NaN', '1e6', 2, '1000000000000000000', '0.1234567891']) {
    assert.throws(() => priceUsage({ ...receipt(), lines: [{ resource: 'cpu', quantity }] }, rates));
  }
  assert.throws(() => priceUsage({ ...receipt(), rateVersion: 'old' }, rates));
  assert.throws(() => priceUsage({ ...receipt(), lines: [{ resource: 'unknown', quantity: '1' }] }, rates));
  assert.throws(() => validateRateCard({ ...rates, rates: {} }));
});
test('verified purchase is credited once across duplicate confirmations and restart', t => {
  const { ledger, file } = fixture(t);
  fund(ledger);
  fund(ledger);
  const other = new Ledger(file);
  try { fund(other); assert.equal(other.summary('alice').balanceNanos, 10000000000); }
  finally { other.close(); }
  assert.equal(ledger.history('alice').entries.length, 1);
  assert.equal(ledger.summary('bob').balanceNanos, 0);
});
test('usage settles atomically once and conflicting reuse cannot debit another account', t => {
  const { ledger } = fixture(t); fund(ledger);
  ledger.recordUsage(receipt(), rates);
  ledger.recordUsage(receipt(), rates);
  assert.equal(ledger.summary('alice').balanceNanos, 9975000000);
  assert.throws(() => ledger.recordUsage({ ...receipt(), userId: 'bob' }, rates));
  assert.equal(ledger.summary('bob').balanceNanos, 0);
});
test('refunds reconcile principal once and usage debt is never erased', t => {
  const { ledger } = fixture(t); fund(ledger); ledger.recordUsage(receipt(), rates);
  const state = { paid: true, refundedCents: 1000, hold: false, lost: false, paymentIntent: 'pi_order-1' };
  ledger.reconcileOrder('order-1', state); ledger.reconcileOrder('order-1', state);
  assert.equal(ledger.summary('alice').balanceNanos, -25000000);
  assert.equal(ledger.summary('alice').canUse, false);
});
test('unpaid orders add nothing and dispute holds block other available funds until cleared', t => {
  const { ledger } = fixture(t); fund(ledger);
  ledger.createOrder({ id: 'pending', userId: 'alice', amountCents: 1000 });
  ledger.reconcileOrder('pending', { paid: false, refundedCents: 0, hold: false, lost: false });
  ledger.reconcileOrder('order-1', { paid: true, refundedCents: 0, hold: true, lost: false, paymentIntent: 'pi_order-1' });
  assert.equal(ledger.summary('alice').canUse, false);
  ledger.reconcileOrder('order-1', { paid: true, refundedCents: 0, hold: false, lost: false, paymentIntent: 'pi_order-1' });
  assert.equal(ledger.summary('alice').canUse, true);
});
test('history has stable pagination without disclosing other users', t => {
  const { ledger } = fixture(t); fund(ledger);
  for (let i = 0; i < 4; i++) ledger.recordUsage(receipt('usage-' + i), rates);
  const first = ledger.history('alice', { limit: 2 });
  const second = ledger.history('alice', { limit: 2, before: first.nextCursor });
  const third = ledger.history('alice', { limit: 2, before: second.nextCursor });
  assert.equal(new Set([...first.entries, ...second.entries, ...third.entries].map(x => x.id)).size, 5);
  assert.equal(third.nextCursor, null);
  assert.equal(ledger.history('bob').entries.length, 0);
});
