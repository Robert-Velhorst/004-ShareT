const { createHash } = require('node:crypto');
const problem = (status, message) => Object.assign(new Error(message), { status });
class BillingService {
  constructor({ ledger, stripe, config }) { Object.assign(this, { ledger, stripe, config }); this.queue = Promise.resolve(); }
  requireEnabled() { if (!this.config.enabled) throw problem(503, 'Resource billing is not configured. No payment has been taken.'); }
  summary(userId) {
    return { enabled: this.config.enabled, mode: this.config.mode, multiplier: '2.5',
      creditsPerEuro: 100, bundlesCents: [1000, 2500, 5000], tax: Boolean(this.config.tax), rateCard: this.config.rateCard || null,
      ...(this.ledger ? this.ledger.summary(userId) : { currency: 'eur', balanceNanos: 0, credits: 0, held: false, canUse: false }) };
  }
  async checkout(user, { amountCents, requestId }) {
    this.requireEnabled();
    if (![1000, 2500, 5000].includes(amountCents) || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{32,80}$/.test(requestId)) throw problem(400, 'Choose a valid credit bundle and checkout request ID');
    const userId = user._id || user.id;
    const id = createHash('sha256').update(userId + ':' + requestId).digest('hex');
    let order;
    try { order = this.ledger.createOrder({ id, userId, amountCents }); }
    catch { throw problem(409, 'This checkout request was already used for a different amount'); }
    if (order.paid) throw problem(409, 'This purchase has already been paid. Start a new purchase.');
    // Stripe retains idempotency keys for at least 24h. Never reuse an old key after that window.
    if (!order.session_id && Date.now() - Date.parse(order.created_at) > 23 * 3600000) throw problem(409, 'Checkout attempt expired. Start a new purchase.');
    const session = order.session_id ? await this.stripe.checkout.sessions.retrieve(order.session_id) : await this.stripe.checkout.sessions.create({
      mode: 'payment', client_reference_id: userId, customer_email: user.email,
      metadata: { sharetOrderId: id }, payment_intent_data: { metadata: { sharetOrderId: id } },
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: amountCents,
        tax_behavior: 'exclusive', product_data: { name: `ShareT: ${amountCents} resource credits` } } }],
      automatic_tax: { enabled: this.config.tax },
      success_url: this.config.origin + '/app?checkout_session={CHECKOUT_SESSION_ID}',
      cancel_url: this.config.origin + '/app?checkout_cancelled=1'
    }, { idempotencyKey: 'sharet-' + id });
    this.ledger.attachSession(id, session.id);
    if (!session.url || !session.url.startsWith('https://checkout.stripe.com/')) throw problem(409, 'Checkout is no longer open. Refresh your balance or start a new purchase.');
    return { url: session.url, sessionId: session.id };
  }
  // Serialise re-fetch + settlement so older snapshots cannot overwrite newer refunds.
  reconcile(sessionId, expectedUser) {
    const operation = this.queue.then(() => this.reconcileNow(sessionId, expectedUser));
    this.queue = operation.catch(() => {});
    return operation;
  }
  async reconcileNow(sessionId, expectedUser) {
    this.requireEnabled();
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    const order = this.ledger.order(session.metadata?.sharetOrderId);
    if (!order || (expectedUser && order.user_id !== expectedUser)) throw problem(404, 'Purchase not found');
    if (session.mode !== 'payment' || session.currency !== 'eur' || session.amount_subtotal !== order.cents ||
        session.client_reference_id !== order.user_id || session.livemode !== (this.config.mode === 'live') ||
        (order.session_id && order.session_id !== session.id)) throw problem(409, 'Payment does not match its ShareT order');
    this.ledger.attachSession(order.id, session.id);
    if (session.payment_status !== 'paid') return { status: session.status === 'expired' ? 'expired' : 'pending', ...this.summary(order.user_id) };
    const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    const payment = await this.stripe.paymentIntents.retrieve(paymentId, { expand: ['latest_charge'] });
    if (payment.status !== 'succeeded' || payment.metadata?.sharetOrderId !== order.id || !payment.latest_charge) throw problem(409, 'Payment is not confirmed');
    const charge = typeof payment.latest_charge === 'string' ? await this.stripe.charges.retrieve(payment.latest_charge) : payment.latest_charge;
    let refunded = 0; let startingAfter;
    do {
      const page = await this.stripe.refunds.list({ charge: charge.id, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
      refunded += page.data.filter(refund => refund.status === 'succeeded').reduce((sum, refund) => sum + refund.amount, 0);
      if (page.has_more && !page.data.length) throw new Error('Incomplete Stripe refund page');
      startingAfter = page.has_more ? page.data.at(-1).id : undefined;
    } while (startingAfter);
    const disputes = await this.stripe.disputes.list({ payment_intent: paymentId, limit: 100 });
    if (disputes.has_more) throw new Error('Incomplete Stripe dispute page');
    const hold = disputes.data.some(dispute => !['won', 'warning_closed', 'lost'].includes(dispute.status));
    const lost = disputes.data.some(dispute => dispute.status === 'lost');
    if (!Number.isSafeInteger(session.amount_total) || session.amount_total < order.cents || !Number.isSafeInteger(refunded) || refunded > session.amount_total) throw new Error('Invalid refund total');
    // Tax is not spendable credit. Reverse the proportional principal on partial refunds.
    const refundedCents = Number(BigInt(refunded) * BigInt(order.cents) / BigInt(session.amount_total));
    this.ledger.reconcileOrder(order.id, { paid: true, refundedCents, hold, lost, paymentIntent: paymentId });
    return { status: lost ? 'disputed' : hold ? 'held' : refunded ? 'refunded' : 'paid', ...this.summary(order.user_id) };
  }
  async webhook(event) {
    if (event.livemode !== (this.config.mode === 'live')) throw problem(400, 'Wrong payment mode');
    const object = event.data.object;
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'].includes(event.type)) return this.reconcile(object.id);
    if (!['charge.refunded', 'refund.created', 'refund.updated', 'refund.failed', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed', 'charge.dispute.funds_reinstated', 'charge.dispute.funds_withdrawn'].includes(event.type)) return;
    let paymentId = object.payment_intent;
    if (!paymentId && object.charge) paymentId = (await this.stripe.charges.retrieve(object.charge)).payment_intent;
    if (!paymentId) return;
    const payment = await this.stripe.paymentIntents.retrieve(paymentId);
    const order = this.ledger.order(payment.metadata?.sharetOrderId);
    if (!order) return; // Another product in the same Stripe account.
    let sessionId = order.session_id;
    if (!sessionId) {
      const sessions = await this.stripe.checkout.sessions.list({ payment_intent: paymentId, limit: 100 });
      sessionId = sessions.data.find(session => session.metadata?.sharetOrderId === order.id)?.id;
    }
    if (!sessionId) throw new Error('Payment session unavailable; retry event');
    return this.reconcile(sessionId);
  }
}
module.exports = { BillingService, problem };
