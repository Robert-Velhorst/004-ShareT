# Hetzner billing handoff — manual migration only

Robert has reserved the ngrok-to-Hetzner migration for ShareT's existing software developer. This document describes the billing integration boundary, not authorization or an automated migration script. Do not provision servers, change DNS, change ngrok, move databases, switch callback URLs or enable live payments through this PR.

## Preserve first

- Review this feature branch separately from the existing hardening PR. Merge only after review; the AI has not modified main or deployed this feature.
- Keep `BILLING_MODE=off` during the migration. Back up and restore the current PouchDB data and secrets through the developer's established process; preserve user IDs and all existing share IDs/URLs. Once used, the new SQLite financial files must also be included in consistent backups.
- The developer owns HTTPS/reverse-proxy configuration, persistent storage, hostname redirects for old links, callback changes, firewall, SMTP and health/recovery checks. Confirm old links, Trello login, bot comments, normal mobile replies, email notifications and history work before enabling billing.
- Do not run two billing writers. The new runtime has an exclusive database lock; use one app process with persistent local storage. A rolling deployment must release the previous writer before starting the replacement.

## What Hetzner does and does not measure

Hetzner Cloud bills server existence using hourly pricing with a monthly cap, including powered-off servers. Outgoing traffic beyond the package allowance is billed; incoming/internal traffic is generally free under the documented rules. Snapshots, backups and IPs have separate billing rules. These are server/project costs, not ShareT customer identities. Consult the selected product and region's actual invoice/pricing; do not copy example prices into production. [Hetzner billing FAQ](https://docs.hetzner.com/cloud/billing/faq/)

A provider CPU/network chart cannot establish each ShareT customer's CPU, RAM or traffic consumption inside a shared Node process. Agree with Robert on one honest accounting approach:

1. **Attributable isolated workloads:** run billable jobs in tenant-isolated workers/containers; collect CPU duration, relevant memory-time and network counters there. Charge only applicable supplier components.
2. **Disclosed shared-cost allocation:** measure the actual server costs and allocate them with a documented methodology and tenant-level work/traffic/storage records. Label these as allocated costs, not directly measured per-request RAM. Include how idle capacity, included traffic, monthly caps and background notifications are treated.

Do not sum CPU, RAM, electricity and an entire VM price when the same resources are already bundled. No GPU/VRAM cost should be charged unless a GPU-backed workload and a corresponding supplier cost actually exist.

## Collector deliverable before activation

Implement the collector appropriate to the final Hetzner deployment, using the contract in [BILLING.md](BILLING.md). It must:

- Resolve public share activity to the stored **share owner's** user ID, and authenticated work to its real account. Ignore client-supplied billing identity.
- Persist unique receipt IDs, measurements, rate versions and time windows before delivery; retry unchanged bodies without double charging.
- Account for counter resets, process/container restarts, concurrent users, scheduled email/polling, shared overhead and storage retention. Prevent overlapping windows/double counting in the collector.
- Emit only supported units with customer-safe evidence references; reconcile supplier-base totals against the actual invoice or allocation policy before applying the fixed 2.5 multiplier.
- Monitor ingestion rejection, collection freshness, replay backlog and invoice discrepancy; pause billing manually when measurements are not trustworthy. Automatic staleness monitoring/circuit-breaking is not supplied by this PR.
- Keep the meter HMAC secret on trusted infrastructure only. Never expose Hetzner/Stripe secrets to browsers or freelancers. No Hetzner API token is required by the wallet itself.

After the migration works, separately configure Stripe sandbox Checkout/webhooks, test the entire purchase-to-usage-to-refund path, finalize public rates/terms/tax treatment, and obtain operator approval for live mode. Do not treat local tests as proof of Hetzner measurement or Stripe provider acceptance.
