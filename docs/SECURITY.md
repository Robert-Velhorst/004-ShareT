# Security and privacy design

## Trust boundaries

The browser, public share recipient, HAI client, Trello, SMTP service, optional CouchDB, and public tunnel are separate trust boundaries. ShareT validates identity, scope, ownership, and input again at the API boundary; frontend state is never authorization evidence.

## Main threats and controls

| Threat | Control |
| --- | --- |
| Link guessing | Cryptographically random share identifiers, rate limits, and optional password/email factors. |
| Fetch-before-auth data leak | Share policy is authorized before any Trello content request. |
| Cross-user access | Owner queries and mutations compare the authenticated user to the resource owner. |
| Credential disclosure | HttpOnly cookies; encrypted Trello tokens; hashed connector tokens; redacted API/export representations. |
| Password reset leakage | Reset URLs are returned only in explicit development mode; production responses do not expose them. |
| Webhook spoofing/replay | Trello signature verification plus persisted action-id idempotency. |
| Reply sent to wrong freelancer | Unique-name or single-waiting-recipient routing; ambiguity is held for review. |
| XSS/HTML injection | React escaping, no raw HTML rendering, safe callback DOM writes, and CSP without global inline-script permission. |
| CSRF/cross-origin access | SameSite cookies and explicit production CORS origins. Mutating HAI calls use bearer credentials rather than cookies. |
| Upload/path abuse | Size/type handling through Multer, filename sanitization, safe disposition headers, and Trello as the file destination. |
| Log privacy | IP addresses are HMAC-hashed, user agents are truncated, and access logs expire. |
| Operational accident | Maintenance mode, public-access kill switch, backups, confirmation-gated restore, and graceful shutdown. |

## Secret rotation

The repository previously tracked environment files. Removing them from the current tree does not erase Git history. The measured redacted baseline is 30 Gitleaks candidates across eight commits, including 20 findings in the historical `.env.docker`; generated dependencies and documentation placeholders account for the other ten. CI scans the changed commit range with a commit-pinned Gitleaks action so new leaks fail the build without pretending the old credentials were revoked. Before production use, rotate every credential that ever appeared there: JWT secrets, encryption key, Trello owner/relay tokens, SMTP credentials, tunnel token, CouchDB credentials, and any third-party key. Re-encrypting stored provider tokens after rotating `ENCRYPTION_KEY` needs a planned migration or reconnection; do not simply replace the key against existing encrypted data.

## Retention and deletion

- Verification records are pruned after expiry.
- Access logs default to 90 days (`SHARET_ACCESS_LOG_RETENTION_DAYS`, clamped to 7–3650).
- Account export recursively removes credentials and internal database identifiers.
- Account deletion removes the user and all documents owned by that user or their shares.
- Backups and CouchDB replicas are independent copies; the operator must apply the same retention/deletion policy there.

## Security acceptance still requiring an operator

- Rotate historical credentials.
- Confirm the public HTTPS origin and CORS list are exact.
- Confirm the relay is a distinct Trello member with only necessary board access.
- Confirm SMTP uses a dedicated app password or least-privilege credential.
- Test backup restore on a non-production data directory.
- Run a live Trello/SMTP/tunnel acceptance pass after configuration.
