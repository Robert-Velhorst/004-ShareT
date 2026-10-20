# Worklog and checkpoint

## 2026-08-09 production hardening

- Audited the 116-phase giant prompt and the actual repository/branch.
- Preserved the Trello-centered workflow while removing the unusable Power-Up and dormant prototype UI.
- Added complete share history pagination and a hierarchical target picker.
- Enforced password/email access before fetching Trello data and propagated grants across every public operation.
- Added dedicated relay assignment, owner watching, notification health, signed webhooks, conservative mobile-reply routing, retry/idempotency, and freelancer email sessions.
- Migrated browser auth to HttpOnly cookies; encrypted Trello credentials; added export/deletion, privacy retention, startup validation, health/readiness, backups, restore, support bundle, and emergency switches.
- Fixed OAuth callback, password reset, stale static manifest, CORS, credit fail-open, localStorage history, and fake billing/resource behavior.
- Added HAI scoped connector credentials, OpenAPI contract, UI, tests, and runbook.
- Added CI, regression tests, architecture/security/operations/acceptance evidence, truthful compliance status, bug log, and debt register.
- Completed clean installs, 37-test regression suite, lint, production build, audits, Compose parsing, runtime/header probes, and Chromium acceptance paths.
- Fixed final QA findings: CSP-safe theme initialization, a quiet signed-out session probe, public-link form semantics, `/share` backward compatibility, a not-found page, and a 90-second first-start health grace.
- Added a versioned startup migration that proactively encrypted the last legacy plaintext Trello credential, rejects newer unsupported schemas before writes, and records readiness-visible schema history.
- Added authenticated HTTP cross-user isolation and adversarial attachment tests, and prevented owner Trello credentials from being forwarded to arbitrary or redirecting attachment origins.
- Reconciled and deployed the canonical Windows source, verified the static ngrok deployment and schema-1 data volume, and published the native HAI connector as a separate draft pull request.

## Resume checkpoint

Local implementation, repository publication, and the static-ngrok Windows deployment are complete. A no-hardlink committed clone passed backend install/tests; its frontend install timed out twice on this antivirus-heavy host and remains an independent-machine gate. Remaining release work is live Trello relay/mobile-bell acceptance, one approved SMTP recipient cycle, HAI source activation with an owner-created token, historical credential rotation, and optional CouchDB recovery testing, all of which remain operator-gated.
