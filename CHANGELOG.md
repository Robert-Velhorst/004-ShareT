# Changelog

## Unreleased

### Added

- Secure combined password and verified-email access grants.
- Complete paginated share-link history and structured Trello target search.
- Dedicated Trello relay assignment, owner watch health, signed reply webhooks, conservative routing, and SMTP reply delivery.
- Account export/deletion, retention controls, doctor/readiness, backup/restore, support bundle, and emergency switches.
- Revocable scoped HAI connector credentials and OpenAPI 3.1 contract.
- Windows standalone and static-ngrok deployment runbooks and CI quality gates.

### Changed

- Browser authentication now uses HttpOnly cookies.
- Trello and relay credentials are encrypted at rest; public responses are redacted.
- Static HTML revalidates while content-hashed assets remain immutable.
- Production CORS and configuration validation fail closed.
- Docker health probes use the IPv4 readiness endpoint, and ngrok receives only its own credential using current static-URL syntax.
- Windows watchdog and redeploy checks use the same explicit Compose environment and readiness contract as the live stack.

### Removed

- Trello Power-Up panel.
- Unreachable mock/marketing UI and legacy MongoDB models.
- Fake payment-status/refund and client-declared resource-metering endpoints.
- Tracked secret environment files from the current tree.

### Security note

Credential removal from the current tree does not rotate or erase secrets from Git history. Production deployment requires external rotation.
