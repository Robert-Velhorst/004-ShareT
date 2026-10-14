const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Stripe = require('stripe');
const { createHmac } = require('node:crypto');
const { Ledger } = require('../billing/ledger');
const { BillingService } = require('../billing/service');
const { createBillingRouter, createWebhookHandler } = require('../billing/routes');
const { readConfig } = require('../billing/config');

const rates = { version: 'test-1', source: 'Test supplier', currency: 'eur', rates: { cpu: { unit: 'second', eurPerUnit: '0.01' } } };
const config = { enabled: true, mode: 'test', origin: 'http://localhost:5005', webhookSecret: 'whsec_test', meterKey: 'm'.repeat(40), rateCard: rates, tax: false };
async function setup(t) {
  const ledger = new Ledger(':memory:');
  let current;
  let charge = { id: 'ch_1', amount: 1000, amount_refunded: 0, refunded: false, disputed: false };
  const sessions = new Map();
  const stripe = { webhooks: Stripe.webhooks,
    checkout: { sessions: {
      create: async (params, options) => {
        assert.equal(params.mode, 'payment');
        assert.equal(params.line_items[0].price_data.unit_amount, 1000);
        assert.ok(options.idempotencyKey);
        current = { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/test', mode: 'payment', currency: 'eur',
          status: 'complete', payment_status: 'paid', amount_subtotal: 1000, amount_total: 1000,
          metadata: params.metadata, client_reference_id: params.client_reference_id, livemode: false,
          payment_intent: 'pi_1' };
        sessions.set(current.id, current); return current;
      },
      retrieve: async id => { assert.ok(sessions.has(id)); return { ...sessions.get(id) }; },
      list: async () => ({ data: [...sessions.values()] })
    } },
    paymentIntents: { retrieve: async id => { assert.equal(id, 'pi_1'); return { id, status: 'succeeded', metadata: current.metadata, latest_charge: charge }; } },
    refunds: { list: async () => ({ data: charge.amount_refunded ? [{ id: 're_1', status: 'succeeded', amount: charge.amount_refunded }] : [], has_more: false }) },
    disputes: { list: async () => ({ data: charge.disputed ? [{ status: 'needs_response' }] : [] }) }
  };
  const service = new BillingService({ ledger, stripe, config });
  const app = express();
  app.post('/webhook', express.raw({ type: 'application/json' }), createWebhookHandler(service));
  app.use(express.json({ verify: (req, _res, body) => { req.rawBody = body; } }));
  const protect = (req, res, next) => {
    if (!['alice', 'bob'].includes(req.headers.authorization)) return res.sendStatus(401);
    req.user = { _id: req.headers.authorization, email: req.headers.authorization + '@example.test' }; next();
  };
  app.use('/billing', createBillingRouter({ service, protect, findUser: async id => ['alice', 'bob'].includes(id) ? { _id: id } : null }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); ledger.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, user = 'alice') => fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: user }, body: body ? JSON.stringify(body) : undefined });
  const buy = () => request('/billing/checkout', { amountCents: 1000, requestId: 'a'.repeat(32) });
  const webhook = async (type = 'checkout.session.completed') => {
    const payload = JSON.stringify({ id: 'evt_1', type, livemode: false, data: { object: { ...current } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: config.webhookSecret });
    return fetch(base + '/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body: payload });
  };
  return { ledger, request, buy, webhook, base, setPaymentStatus: value => { current.payment_status = value; }, setCharge: value => { charge = { ...charge, ...value }; } };
}
test('billing stays off by default and refuses unsafe activation settings', () => {
  assert.equal(readConfig({}).enabled, false);
  assert.throws(() => readConfig({ BILLING_MODE: 'live' }));
});
test('checkout requires authentication, server prices, and never credits from redirect alone', async t => {
  const f = await setup(t);
  assert.equal((await f.request('/billing/checkout', { amountCents: 1 }, '')).status, 401);
  assert.equal((await f.request('/billing/checkout', { amountCents: 1, requestId: 'a'.repeat(32) })).status, 400);
  assert.equal((await f.buy()).status, 200);
  assert.equal(f.ledger.summary('alice').balanceNanos, 0);
  assert.equal((await f.webhook()).status, 200);
  assert.equal((await f.webhook()).status, 200);
  assert.equal(f.ledger.summary('alice').balanceNanos, 10000000000);
  const other = await f.request('/billing/checkout/cs_test_1', undefined, 'bob');
  assert.equal(other.status, 404);
});
test('unpaid checkout is not fulfilled and asynchronous success is credited', async t => {
  const f = await setup(t); await f.buy(); f.setPaymentStatus('unpaid');
  await f.webhook(); assert.equal(f.ledger.summary('alice').balanceNanos, 0);
  f.setPaymentStatus('paid'); await f.webhook('checkout.session.async_payment_succeeded');
  assert.equal(f.ledger.summary('alice').balanceNanos, 10000000000);
});
test('invalid webhook signature changes no balance', async t => {
  const f = await setup(t); await f.buy();
  const response = await fetch(f.base + '/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 400); assert.equal(f.ledger.summary('alice').balanceNanos, 0);
});
test('provider refunds remove balance and disputes block spending', async t => {
  const f = await setup(t); await f.buy(); await f.webhook();
  f.setCharge({ amount_refunded: 500 }); await f.webhook();
  assert.equal(f.ledger.summary('alice').balanceNanos, 5000000000);
  f.setCharge({ disputed: true }); await f.webhook();
  assert.equal(f.ledger.summary('alice').canUse, false);
});
test('only signed trusted metering can settle usage; receipts are owner scoped and idempotent', async t => {
  const f = await setup(t); await f.buy(); await f.webhook();
  const receipt = { id: 'u1', userId: 'alice', rateVersion: 'test-1', source: 'container', evidence: 'cpu-1',
    startedAt: '2026-09-04T10:00:00Z', endedAt: '2026-09-04T11:00:00Z', lines: [{ resource: 'cpu', quantity: '1' }] };
  assert.equal((await f.request('/billing/usage', receipt)).status, 401);
  const body = JSON.stringify(receipt); const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', config.meterKey).update(timestamp + '.' + body).digest('hex');
  for (let i = 0; i < 2; i++) {
    const response = await fetch(f.base + '/billing/usage', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Meter-Timestamp': timestamp, 'X-Meter-Signature': signature }, body });
    assert.equal(response.status, 200);
  }
  assert.equal(f.ledger.summary('alice').balanceNanos, 9975000000);
  const other = await (await f.request('/billing/history', undefined, 'bob')).json();
  assert.equal(other.entries.length, 0);
});
