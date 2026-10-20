const fs = require('node:fs');
const path = require('node:path');
const { readConfig } = require('./config');
const { BillingService } = require('./service');
let service;
let writerLock;
function getBilling() {
  if (service) return service;
  const config = readConfig();
  let ledger; let stripe;
  if (config.enabled) {
    const { Ledger } = require('./ledger');
    const { acquireWriterLock } = require('./writerLock');
    const Stripe = require('stripe');
    const directory = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
    fs.mkdirSync(directory, { recursive: true });
    writerLock = acquireWriterLock(path.join(directory, `prepaid-${config.mode}-writer.sqlite`));
    try {
      ledger = new Ledger(path.join(directory, `prepaid-${config.mode}.sqlite`));
      stripe = new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 15000 });
    } catch (error) { ledger?.close(); writerLock.close(); writerLock = undefined; throw error; }
  }
  service = new BillingService({ config, ledger, stripe });
  return service;
}
function closeBilling() { service?.ledger?.close(); writerLock?.close(); writerLock = undefined; service = undefined; }
module.exports = { getBilling, closeBilling };
