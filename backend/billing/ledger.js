const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const { priceUsage } = require('./pricing');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,160}$/.test(value);
class Ledger {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS wallets(user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, cents INTEGER NOT NULL,
        session_id TEXT UNIQUE, payment_intent TEXT UNIQUE, applied INTEGER NOT NULL DEFAULT 0,
        paid INTEGER NOT NULL DEFAULT 0, hold INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
      CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
        kind TEXT NOT NULL, amount INTEGER NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS journal_user ON journal(user_id, id);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_versions(version TEXT PRIMARY KEY, digest TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  append(userId, kind, amount, detail) {
    this.db.prepare('INSERT OR IGNORE INTO wallets(user_id) VALUES(?)').run(userId);
    const balance = this.db.prepare('SELECT balance FROM wallets WHERE user_id=?').get(userId).balance + amount;
    if (!Number.isSafeInteger(balance)) throw new Error('Balance limit exceeded');
    this.db.prepare('UPDATE wallets SET balance=? WHERE user_id=?').run(balance, userId);
    this.db.prepare('INSERT INTO journal(user_id,kind,amount,detail,created_at) VALUES(?,?,?,?,?)')
      .run(userId, kind, amount, JSON.stringify(detail), new Date().toISOString());
  }
  createOrder({ id, userId, amountCents }) {
    if (!identifier(id) || !identifier(userId) || ![1000, 2500, 5000].includes(amountCents)) throw new Error('Invalid order');
    this.db.prepare('INSERT OR IGNORE INTO orders(id,user_id,cents,created_at) VALUES(?,?,?,?)')
      .run(id, userId, amountCents, new Date().toISOString());
    const order = this.order(id);
    if (order.user_id !== userId || order.cents !== amountCents) throw new Error('Checkout key was already used for another order');
    return order;
  }
  order(id) { return this.db.prepare('SELECT * FROM orders WHERE id=?').get(id); }
  byPayment(id) { return this.db.prepare('SELECT * FROM orders WHERE payment_intent=?').get(id); }
  attachSession(id, sessionId) {
    const order = this.order(id);
    if (!order || (order.session_id && order.session_id !== sessionId)) throw new Error('Checkout session mismatch');
    this.db.prepare('UPDATE orders SET session_id=? WHERE id=?').run(sessionId, id);
  }
  reconcileOrder(id, state) {
    return this.transaction(() => {
      const order = this.order(id);
      if (!order || !Number.isSafeInteger(state.refundedCents) || state.refundedCents < 0 || state.refundedCents > order.cents) throw new Error('Invalid payment reconciliation');
      if (order.payment_intent && state.paymentIntent !== order.payment_intent) throw new Error('Payment identity mismatch');
      const paid = Boolean(order.paid || state.paid);
      const target = paid && !state.lost ? (order.cents - state.refundedCents) * 10000000 : 0;
      const delta = target - order.applied;
      if (delta) this.append(order.user_id, delta > 0 ? 'purchase' : 'reversal', delta,
        { orderId: id, paymentIntent: state.paymentIntent, refundedCents: state.refundedCents, lost: state.lost });
      if (Boolean(order.hold) !== state.hold) this.append(order.user_id, state.hold ? 'payment_hold' : 'payment_hold_released', 0, { orderId: id });
      this.db.prepare('UPDATE orders SET applied=?,paid=?,hold=?,payment_intent=COALESCE(?,payment_intent) WHERE id=?')
        .run(target, Number(paid), Number(state.hold), state.paymentIntent || null, id);
      return this.summary(order.user_id);
    });
  }
  recordUsage(receipt, card) {
    if (!identifier(receipt.id) || !identifier(receipt.userId) ||
        typeof receipt.source !== 'string' || !receipt.source.trim() || receipt.source.length > 200 ||
        typeof receipt.evidence !== 'string' || !receipt.evidence.trim() || receipt.evidence.length > 500 ||
        !Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.endedAt)) ||
        Date.parse(receipt.startedAt) > Date.parse(receipt.endedAt) || Date.parse(receipt.endedAt) > Date.now() + 300000) throw new Error('Invalid usage evidence');
    const priced = priceUsage(receipt, card);
    const digest = hash(receipt);
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT digest FROM receipts WHERE id=?').get(receipt.id);
      if (previous) {
        if (previous.digest !== digest) throw new Error('Usage receipt ID conflict');
        return { duplicate: true, ...this.summary(receipt.userId) };
      }
      const version = this.db.prepare('SELECT digest FROM rate_versions WHERE version=?').get(card.version);
      if (version && version.digest !== hash(card)) throw new Error('Rate version is immutable; publish a new version');
      this.db.prepare('INSERT OR IGNORE INTO rate_versions VALUES(?,?)').run(card.version, hash(card));
      this.db.prepare('INSERT INTO receipts VALUES(?,?)').run(receipt.id, digest);
      this.append(receipt.userId, 'usage', -priced.chargeNanos, { receipt, ...priced });
      return { duplicate: false, ...this.summary(receipt.userId) };
    });
  }
  summary(userId) {
    const balanceNanos = this.db.prepare('SELECT balance FROM wallets WHERE user_id=?').get(userId)?.balance || 0;
    const held = Boolean(this.db.prepare('SELECT 1 FROM orders WHERE user_id=? AND hold=1 LIMIT 1').get(userId));
    return { currency: 'eur', balanceNanos, credits: balanceNanos / 10000000, held, canUse: balanceNanos > 0 && !held };
  }
  history(userId, { limit = 20, before = Number.MAX_SAFE_INTEGER } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(before) || before < 1) throw new Error('Invalid history cursor');
    const rows = this.db.prepare('SELECT * FROM journal WHERE user_id=? AND id<? ORDER BY id DESC LIMIT ?').all(userId, before, limit + 1);
    const entries = rows.slice(0, limit).map(row => ({ id: row.id, kind: row.kind, amountNanos: row.amount, detail: JSON.parse(row.detail), createdAt: row.created_at }));
    return { entries, nextCursor: rows.length > limit ? entries.at(-1).id : null };
  }
}
module.exports = { Ledger };
