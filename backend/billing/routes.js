const express = require('express');
const { createHmac, timingSafeEqual } = require('node:crypto');
const { problem } = require('./service');
const handle = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    if (!error.status) console.error('Billing operation failed:', error.name || 'Error');
    res.status(error.status || 503).json({ success: false, message: error.status ? error.message : 'Billing temporarily unavailable. Please retry; confirmed payments are not lost.' });
  }
};
function createWebhookHandler(service) {
  return handle(async (req, res) => {
    service.requireEnabled();
    let event;
    try { event = service.stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], service.config.webhookSecret); }
    catch { throw problem(400, 'Invalid Stripe signature'); }
    await service.webhook(event);
    res.json({ received: true });
  });
}
function createBillingRouter({ service, protect, findUser }) {
  const router = express.Router();
  router.post('/usage', handle(async (req, res) => {
    service.requireEnabled();
    const timestamp = req.headers['x-meter-timestamp']; const signature = req.headers['x-meter-signature'];
    if (typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
        typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature) || !Buffer.isBuffer(req.rawBody)) throw problem(401, 'Invalid meter signature');
    const expected = createHmac('sha256', service.config.meterKey).update(timestamp + '.').update(req.rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw problem(401, 'Invalid meter signature');
    if (!await findUser(req.body.userId)) throw problem(400, 'Unknown usage account');
    let result;
    try { result = service.ledger.recordUsage(req.body, service.config.rateCard); }
    catch (error) { throw problem(400, error.message); }
    res.json(result);
  }));
  router.use(protect);
  router.use((req, res, next) => req.user.isActive === false ? res.status(403).json({ message: 'Account is inactive' }) : next());
  router.get('/wallet', handle(async (req, res) => { res.json(service.summary(req.user._id || req.user.id)); }));
  router.get('/history', handle(async (req, res) => {
    const limit = Number(req.query.limit || 20); const before = req.query.before ? Number(req.query.before) : Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(before) || before < 1) throw problem(400, 'Invalid pagination');
    res.json(service.ledger ? service.ledger.history(req.user._id || req.user.id, { limit, before }) : { entries: [], nextCursor: null });
  }));
  router.post('/checkout', handle(async (req, res) => { res.json(await service.checkout(req.user, req.body)); }));
  router.get('/checkout/:sessionId', handle(async (req, res) => {
    if (!/^cs_(test_|live_)?[A-Za-z0-9_]{1,200}$/.test(req.params.sessionId)) throw problem(400, 'Invalid session');
    res.json(await service.reconcile(req.params.sessionId, req.user._id || req.user.id));
  }));
  router.all('*', (_req, res) => res.status(410).json({ message: 'Legacy simulated billing is retired. Use the prepaid wallet.' }));
  return router;
}
module.exports = { createBillingRouter, createWebhookHandler };
