# Prepaid resource billing implementation plan

**Goal:** Buy prepaid ShareT resource credits in the app, debit documented supplier consumption at exactly 2.5 times cost, and deliver only through a pull request.

**Architecture:** Stripe-hosted one-time Checkout; signed webhooks; a dedicated transactional SQLite ledger under DATA_DIR; authenticated infrastructure usage receipts with immutable rate snapshots. Existing PouchDB share allowances are preserved, never converted into money. Billing is disabled by default. A hosting-specific collector and real supplier rates are an activation prerequisite, not simulated by browser or process timing.

**Constraints:** EUR initially; 100 resource credits = EUR 1; fixed 5/2 multiplier; no automatic recharge; server-selected EUR 10/25/50 purchases; no changes to main; no deployment, provider account changes or real payments. SQLite requires Node 22.13+. No CouchDB replication of financial state.

## Execution checklist

- [x] Ledger: write and run failing `backend/test/prepaidLedger.test.js`; implement `backend/billing/ledger.js` and `pricing.js`; check atomic credit/debit, duplicate receipt mismatch, concurrent connections, negative postpaid settlement, refund reconciliation, cursor history, decimal arithmetic and restart persistence.
- [x] Checkout: write failing `backend/test/prepaidHttp.test.js`; implement `config.js`, `service.js`, `routes.js`; authenticate customers, validate server amount, persist order before remote call, verify raw signed webhook, re-fetch provider state, settle paid principal once, handle delayed payments, refund/dispute holds and retries. Network is mocked only at the Stripe boundary.
- [x] Access: connect billing mode to create-share and public owner-funded routes; wallet balance gates resource actions, while billing/account/link management stays accessible. Keep legacy allowances unchanged when disabled. Retire simulated payment/resource writes.
- [x] Interface: replace Wise dialog with wallet, explicit checkout status, configurable-ready state, rate table, paginated audit history, low-balance warning and refresh on focus/return; keep accessible shared UI components. Purchasing must not require connecting Trello first.
- [x] Operations: document environment, receipt contract and allocation limits, refund/dispute workflow, storage backup, staged activation, provider testing and rollback. Never claim unimplemented host collection exists.
- [x] Verify backend tests, targeted frontend lint, frontend build, dependency findings, isolated HTTP/UI smoke; review diff and secret exclusions. Independent review fixes cover background wallet guards, invalid checkout-reference recovery and an exclusive billing-writer lock. Browser checks use API fixtures, not Stripe or hosting acceptance.
- [x] Published this feature branch as [draft PR #156](https://github.com/Robert-Velhorst/004-ShareT/pull/156) against main without merging. Live check status is recorded in the PR.
- [ ] Developer-only activation: manual Hetzner migration, tenant usage collector, invoice reconciliation and real Stripe sandbox acceptance. These are deliberately not represented as implemented or verified.

## Resource accounting decision

CPU time, RAM/VRAM GB-seconds, GPU-seconds, ingress/egress GB, storage/backup GB-hours, metered email/API calls and electricity kWh can be rated. Only independently billed components belong in the rate card: do not charge RAM/electricity again when included in a VM/GPU price. Shared infrastructure requires an operator-documented allocation method. Robert specified a future Hetzner deployment and reserved its manual migration for the existing software developer. The final topology, attribution method and supplier costs have not been supplied, so no collector or default cost values can truthfully be activated. A trusted collector sends exact decimal quantities, user ID, period, rate version, source and evidence reference; server rejects missing/mismatched configuration. Actual collected usage can settle below zero to preserve the cost record; subsequent requests are blocked. This is not a hard real-time spending cap or reservation system.
