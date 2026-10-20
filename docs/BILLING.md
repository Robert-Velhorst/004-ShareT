# Prepaid credits and resource billing

## For customers

Open **Credits & usage** in ShareT. Buy a €10/€25/€50 top-up through Stripe's hosted checkout. One resource credit is €0.01, with fractional credits used for small charges. A verified payment funds your balance automatically; returning to ShareT only asks the server to verify the payment. Delayed payment methods remain pending until the provider confirms them. The screen refreshes while open and when you return to it; payments do not require the browser to remain open.

Resource cost is the sum of measured quantities multiplied by the operator's declared supplier rates. ShareT charges 2.5 times that sum. For example, **€0.04 of supplier consumption costs €0.10 (10 credits)**. This is a 150% markup on the included base costs, not a guarantee of net profit. Payment-processing fees, taxes, fixed overhead and unallocated costs can still reduce the operator's margin.

The share owner pays for guest activity. Freelancers remain Trello-account-free and do not have to purchase credits. Empty balances or payment holds pause creation and guest access; billing, authentication and existing link management remain available. Negative balances can arise from late usage settlements or refunds of previously spent credits. Top-ups cover the deficit first. There is no subscription, auto-recharge, cash withdrawal, customer-to-customer credit transfer or automatic expiry of purchased credits.

## Implementation status and activation boundary

Balance holds also pause owner card/board resource requests, background reply polling/email delivery and webhook registration. Reply delivery keeps its existing retryable event so it can resume after funding. Already received inbound webhooks, storage and minimal management/authentication operations still consume overhead; no prepaid check is a provider-level hard cap.

The planned Hetzner move is a **manual developer operation**, as requested by Robert. This PR must not migrate, provision, change DNS, change ngrok, or cut over production. See [the developer handoff](HETZNER_BILLING_HANDOFF.md).

Implemented: hosted Checkout; server-controlled bundles; signed webhook verification; re-fetching authoritative payment/refund/dispute state; atomic prepaid ledger; decimal resource pricing; signed infrastructure receipt ingestion; owner-funded access checks; separate test/live ledgers; itemized, paginated history; disabled, pending, cancelled, low-balance and payment-hold UI states.

**Not implemented: the hosting-specific resource collector.** Neither a CPU percentage from a browser nor the difference between `process.cpuUsage()` before and after an asynchronous request establishes that customer's actual CPU use. ShareT serves multiple users in one process, so process RSS is not each tenant's RAM. The operator must integrate a collector providing genuine attributable measurements (e.g. per-tenant isolated workload counters), or explicitly disclose a justified shared-cost allocation method. `BILLING_METER_READY=true` is an operator declaration, not an automatic collector discovery/health test. Collector health, replay backlog and usage-period completeness require external monitoring; this version has no automated meter-staleness circuit breaker.

Also not validated here: live Stripe account/payment methods, real card payments, provider test-mode round trips, tax registration/classification, customer terms/refund policy, real supplier costs, provider counters or production deployment. Keep this feature off until those gates are complete. Do not market simulated test receipts as measured consumption.

## Cost model and units

Supported resource names: `cpu`, `ram`, `gpu`, `vram`, `ingress`, `egress`, `storage`, `backup`, `email`, `api`, `electricity`. Each enabled resource has an explicit unit and EUR supplier price per unit. Examples of units are CPU-seconds, GB-seconds, GPU-seconds, GB of egress, storage GB-hours, messages, calls and kWh. GPU and VRAM need actual GPU-backed work; the ordinary ShareT server does not inherently use a GPU.

Other relevant costs include database storage/I/O, backups, logs, monitoring, CDN/egress and metered third-party delivery/API calls. Do not double count: if the provider charges a VM-hour including CPU, RAM and electricity, do not charge all three again on top of the VM price. A fixed subscription is not automatically a directly attributable per-user resource bill. Currency conversion, allocation policy and invoice reconciliation must be determined before publishing the rates. There are no invented default prices.

The ledger uses integer nano-euros (1 euro = 1,000,000,000 units), not floating-point monetary arithmetic. Quantities and unit prices are decimal **strings** with up to nine decimal places. It sums line products and applies 5/2 with integer arithmetic. Fractions below one nano-euro per receipt are waived rather than rounded up. The UI may display up to nine euro decimals and seven fractional credit decimals. Purchase amounts are integer cents. Taxes do not become spendable credit. Partial refunds proportionally remove principal, rounded down to cents; a full refund removes the full principal.

## Operator setup

1. Use a separate staging installation and Stripe sandbox first. Run one ShareT application process per billing ledger. A separate SQLite exclusive writer lock enforces one active runtime for each mode/DATA_DIR, and the OS releases it after a crash. Do not enable Node cluster/PM2 multi-instance or multiple replicas against this ledger. Do not bypass `billing/runtime.js` to start independent billing writers. Distributed deployment needs a transactional central database and distributed provider-order serialization first.
2. Supply strong, randomly generated `JWT_SECRET` and `BILLING_METER_KEY` values (at least 32 characters). Existing example JWT secrets are rejected for billing. Review existing production authentication/security findings before allowing purchases; this PR does not merge the separate hardening PR.
3. Create a Stripe account and obtain its server secret and webhook signing secret through the provider's secure configuration. Never put them in frontend `VITE_*` values, rate-card files, Git or logs. Use a separate key for the infrastructure collector; it is trusted to debit accounts and must never be sent to customers.
4. Store a private, versioned rate-card JSON file outside source control. Set `BILLING_RATE_CARD_FILE` to its absolute server/container path. Mount it read-only when using Docker. Units and costs must match the collector exactly.
5. Integrate and validate the collector, including guest-to-owner attribution, counter resets, repeated receipts, period gaps, retries, shared background work, allocation disclosure and supplier-invoice totals. Receipts need durable provider/counter identities; random IDs on retries cause duplicate charges. Monitor ingestion failures and stale collection.
6. Configure the variables below. Use `BILLING_MODE=test`, not `live`, for acceptance testing. The Docker compose service reads `.env.docker`; backend example settings must be copied to the actual deployment environment. This change does not copy secrets or redeploy anything.
7. Register the HTTPS webhook path `/api/billing/webhook` in Stripe. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_reinstated`, `charge.dispute.funds_withdrawn`. Use the installed SDK's API version (`2026-08-26.dahlia` for Stripe 22.6.1) for the snapshot endpoint and review it when updating the SDK.
8. Configure Stripe's customer receipts, payment methods, tax registrations/tax treatment and customer terms/refund policy with your operator/advisers. Set `BILLING_STRIPE_TAX=true` only after configuring Stripe Tax appropriately. If false, Checkout does not automatically calculate tax; this is not a statement that tax is unnecessary. Processing fees are not deducted from the customer's prepaid principal and are not silently added to resource consumption.
9. Test checkout, cancellation, asynchronous payment, duplicate delivery, server restart, wrong account, failed signature, full/partial refund, failed refund and won/lost dispute. Reconcile test wallet totals against the provider. Existing accounts have **zero resource money** until funded; their old allowances are not converted. Communicate the switchover and link-pausing behavior before enabling billing for users.
10. Only after acceptance, use live-mode keys and `BILLING_LIVE_APPROVED=true`. This is an explicit gate in addition to `BILLING_MODE=live`. No live action or payment is performed by setting up this pull request.

| Variable | Meaning |
|---|---|
| `BILLING_MODE` | `off` (default), `test`, or `live` |
| `BILLING_PUBLIC_ORIGIN` | Canonical HTTPS origin only; no path/query; HTTP localhost allowed in test mode |
| `STRIPE_SECRET_KEY` | `sk_test_…` or `sk_live_…` matching mode |
| `STRIPE_WEBHOOK_SECRET` | Endpoint-specific `whsec_…` |
| `BILLING_METER_KEY` | Separate random HMAC secret shared only with the trusted collector |
| `BILLING_RATE_CARD_FILE` | Absolute path to validated rate-card JSON |
| `BILLING_METER_READY` | Must be `true` after operator verification of the collector |
| `BILLING_LIVE_APPROVED` | Must also be `true` for live mode |
| `BILLING_STRIPE_TAX` | Enable configured Stripe automatic tax; default false |
| `DATA_DIR` | Persistent directory for PouchDB and separate SQLite billing files |

Rate-card shape (illustrative numbers **only**, not your actual costs):

```json
{
  "version": "supplier-2026-09-v1",
  "currency": "eur",
  "source": "Customer-safe reference to supplier rate schedule",
  "rates": {
    "cpu": { "unit": "cpu-second", "eurPerUnit": "0.00001" },
    "egress": { "unit": "GB", "eurPerUnit": "0.01" }
  }
}
```

The source reference and rates are visible to customers: never include private invoice information. Once a version has settled usage, its content is immutable. Publish a new version for changed rates. The server accepts only its currently configured version; drain the collector's old-version backlog before a coordinated rate change. Historical entries retain their full rate snapshot.

## API and collector contract

Authenticated customer endpoints use the existing ShareT bearer authentication:

| Method/path | Behavior |
|---|---|
| `GET /api/billing/wallet` | Mode/readiness, balance, bundles, hold and rate card |
| `GET /api/billing/history?limit=20&before=123` | Owner-only keyset pagination; follow `nextCursor` until null |
| `POST /api/billing/checkout` | `{ "amountCents": 1000, "requestId": "client-generated UUID" }`; returns Stripe URL |
| `GET /api/billing/checkout/:sessionId` | Verify/reconcile an authenticated owner's purchase; never accepts client amount/paid status |
| `POST /api/billing/webhook` | Public but Stripe-signature protected, raw body, 1 MB maximum |
| `POST /api/billing/usage` | Collector only: timestamped HMAC, not customer bearer auth |

The checkout request ID is scoped to the account and amount. Duplicate requests reuse the order/session; reuse with another amount fails. Unresolved attempts older than 23 hours are refused before Stripe's idempotency retention can expire. Expired/finished sessions need an explicit new purchase attempt. A failed delivery returns a retryable non-2xx response; resubmit failed Stripe events after fixing the underlying cause.

Usage body:

```json
{
  "id": "provider-account:counter-period-unique-id",
  "userId": "the-share-owner-pouchdb-user-id",
  "rateVersion": "supplier-2026-09-v1",
  "source": "isolated-tenant-container",
  "evidence": "customer-safe-counter-range-reference",
  "startedAt": "2026-09-04T10:00:00Z",
  "endedAt": "2026-09-04T11:00:00Z",
  "lines": [{ "resource": "cpu", "quantity": "2.5" }]
}
```

Send `Content-Type: application/json`, `X-Meter-Timestamp` as Unix seconds, and `X-Meter-Signature` as lowercase hex HMAC-SHA256 of **timestamp + '.' + exact UTF-8 request body**, signed with `BILLING_METER_KEY`. Timestamps must be within five minutes; sign retries with a new timestamp but the **identical receipt body**. Receipt IDs are globally unique across collectors and accounts. Identical replay returns `duplicate: true`; changed content under the same ID is rejected. Unknown users/resources, invalid decimals, missing provenance, future/invalid periods, changed rate versions and oversized charges fail without a debit. The trusted collector—not a freelancer-supplied request field—must select the share owner.

Recorded evidence/source references are customer-visible. Store raw supplier traces outside the wallet under your retention/access policy; reference them without secrets or another tenant's information. A receipt is a trusted measurement assertion, not independent proof of its source: HMAC ensures who submitted it, not whether the quantities are truthful. Operator review and provider reconciliation remain essential.

## Refunds, disputes and recovery

Refund through Stripe's Dashboard under your refund policy; ShareT consumes the resulting signed events. There is no browser endpoint that issues a real refund or pretends one succeeded. Completed refund amounts reduce principal; pending/failed refunds do not. Reconciliation always re-fetches provider state rather than applying webhook deltas blindly. Open disputes hold spending; won/closed warning disputes release the hold; lost disputes reverse the purchase principal. A new top-up does not release an unrelated dispute hold. Multiple partial refunds are fully paginated.

Wallet balance and journal insertion share one SQLite transaction. Usage receipts and their debits are committed atomically. Purchases may replay after process crashes without being credited twice. Test and live databases are separate; never rename/copy test money into live state. The ledger journal is append-only through this API, but the server operator can still edit its database: this is an audit trail, not cryptographic tamper-proof storage.

Back up all of `DATA_DIR`, including `prepaid-*.sqlite` and associated `-wal`/`-shm` files, while ShareT is stopped; do not copy only an active SQLite main file. Alternatively use a SQLite-consistent backup procedure. Protect and verify recovery of the financial backup, retain records according to your legal policy, and preserve user IDs when restoring PouchDB. Financial state is deliberately not replicated through CouchDB. Existing account deletion does not erase the financial ledger; any lawful retention/erasure workflow must handle it separately.

For rollback, stop new purchase availability and drain webhook/collector backlogs before turning `BILLING_MODE=off`. Off mode rejects settlement webhooks until re-enabled (Stripe retries within its delivery window); do not leave payments in flight indefinitely or delete the ledger. Disabling billing restores the preserved per-share allowance rules, not unlimited shares. Do not merge, deploy or switch modes automatically from a PR.

## Verification

```sh
npm ci
npm run test:billing-ui
npm run build
cd backend
npm ci
npm test
```

The automated HTTP tests use the real router, SDK signature verification and SQLite ledger, with a controlled Stripe network boundary. They do not make provider payments. A real Stripe sandbox walkthrough and actual host collector/invoice acceptance are separate release requirements.

Primary references: [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [signed webhooks](https://docs.stripe.com/webhooks), [refund lifecycle](https://docs.stripe.com/refunds), [disputes](https://docs.stripe.com/disputes).
