/**
 * Billing Routes
 * Handles billing, invoices, and payment processing
 */
const express = require('express');
const { protect } = require('../middleware/auth');
const { User } = require('../db/pouchdb');
const { createBillingRouter } = require('../billing/routes');
const { getBilling } = require('../billing/runtime');
const router = express.Router();
let prepaid;
router.use((req, res, next) => {
  prepaid ||= createBillingRouter({ service: getBilling(), protect, findUser: id => User.findById(id) });
  return prepaid(req, res, next);
});
module.exports = router;
