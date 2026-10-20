# Final verification

Date: 2026-08-09
Branch: `agent/sharet-giant-goal`

## Release decision

The repository is a production-oriented owner-acceptance candidate. The local application, browser flows, database boundary, connector contract, Windows scripts, Docker deployment, static ngrok origin, and backup/restore path have been exercised. It is not yet provider-accepted: a distinct Trello relay identity, end-to-end SMTP reply delivery, HAI source activation, CouchDB recovery, and historical credential rotation require the operator's accounts and approval.

## Automated evidence

| Gate | Result |
| --- | --- |
| Frontend clean install | Passed with `npm ci` in the working checkout; a separate committed-clone retry timed out on this Windows/antivirus host and remains an independent-machine gate. |
| Backend clean install | Passed with `npm ci`; dependency tree is consistent. |
| Frontend lint | Passed with zero warnings. |
| Backend tests | 37 passed, 0 failed, including proactive credential migration, unsafe-downgrade rejection, authenticated cross-user HTTP isolation, adversarial attachment filenames, and the Trello attachment credential boundary. |
| Production build/copy | Passed; 2,369 modules transformed and the served bundle refreshed. |
| Frontend audit | 0 vulnerabilities after lockfile-safe advisory updates. |
| Backend audit | 0 high/critical; 7 moderate reports are the upstream PouchDB UUID advisory. npm's only automatic proposal is an unsafe downgrade from PouchDB 8 to 6, so it was not applied. |
| Diff integrity | `git diff --check` passed. |
| Docker Compose parse | `docker compose --env-file .env.docker.example config --quiet` passed. |
| Doctor | Passed with an isolated valid runtime configuration; the owner's unconfigured local file correctly fails closed on missing production secrets. |

## Runtime and browser evidence

- `/ready` returned 200 with PouchDB connected, bounded cache statistics, explicit provider capability warnings, and approximately 22 MB used heap in the QA fixture.
- Signed-out `/api/auth/session` returned 200 with `authenticated: false`, avoiding an expected 401 console error while protected endpoints remain protected.
- HTML returned `Cache-Control: no-cache`; the hashed JavaScript bundle returned `public, max-age=31536000, immutable`.
- The public HAI OpenAPI endpoint returned OpenAPI 3.1 with the status, board, and share-management paths.
- A write-scoped connector token was created, used, revoked, and then rejected; a read-only token received 403 for a write. Connector secrets were shown once and only hashes were stored.
- Chromium rendered sign-in, privacy, terms, the canonical `/shared/:id` link, and the compatibility `/share/:id` link. A valid link secret advanced to the freelancer name/email gate with no application console errors.
- The QA environment intentionally lacked SMTP and Trello credentials; the UI and readiness endpoint reported those capabilities unavailable instead of simulating success.
- The database index marker skipped index rebuilding on restart. On this Windows/antivirus environment, cold process and database startup still reached readiness at about 85 seconds, so Docker now grants a 90-second first-start health period.
- Versioned data schema 1 was deployed against a verified offline volume backup. It proactively found and encrypted one remaining plaintext owner Trello token, recorded the completed migration only after the write succeeded, and exposed matching current/supported schema versions through `/ready`; the live migration produced zero errors or warnings.
- A no-hardlink clone of commit `b6bc86c` was created successfully. Its backend clean install, 32 tests, and high-severity audit gate passed. Its frontend `npm ci` did not complete within either a four-minute or ten-minute window on this host, even though the same lockfile's clean install passed in the working checkout; this is recorded as unresolved environment acceptance rather than reported as success.
- The production Compose stack was rebuilt and restarted on Windows 11. `sharet-app` reached Docker `healthy` with zero restarts, and both local and static-ngrok `/ready` returned 200 with PouchDB connected and zero runtime errors.
- The ngrok container receives only `NGROK_AUTHTOKEN`; application JWT, Trello, SMTP, Stripe, and database credentials are no longer copied into that container. The current ngrok `--url=https://...` syntax was verified against the running image.
- An offline archive of the live named data volume was created before deployment (1,518,080 bytes, 267 entries, SHA-256 `F536A7B6480D7248F7FFAE72F46E351C96174B464DF7561F15CBC0B0F2B8B02F`). An isolated backup/restore round trip preserved hashes and prior destination state, while a tampered backup was rejected before destination creation.
- Immediately before the schema migration, the paused live volume was archived consistently to `sharet-data-pre-schema-v1-20260809T164524Z.tar.gz` (781,972 bytes, 293 entries, SHA-256 `C5648610EC28985363DBCD5628F6F91FE41E6450C96957F94DAE29A80C16AAA9`).
- The support bundle reached the live readiness endpoint, reported zero runtime errors, contained no environment block, and matched none of the configured sensitive credential values.
- The scheduled Windows watchdog was found recreating the container from an older Compose file. Its installed and repository scripts now use the same explicit env file and IPv4 readiness probe as deployment. A manual watchdog tick did not recreate the container; Docker, local readiness, public readiness, and PouchDB all remained healthy.
- The installed Windows source was reconciled byte-for-byte with all 186 tracked release files while preserving four local environment files, backups, and logs; 44 obsolete mock, Mongo, and Power-Up files were removed. A canonical rebuild contained no `.env*` files, and the running container now uses that exact local image.
- Docker build inputs are separated by responsibility: local environment files, backups, support bundles, and rotated watchdog logs are excluded, while backend-only rebuild validation kept every frontend layer cached and completed in 13.3 seconds instead of rebuilding 2,369 frontend modules.
- The attachment security and cross-user isolation release was rebuilt from commit `ed140c1`; the completed image contained no `.env*` files, the installed source was semantically identical after Windows line-ending normalization, Docker reported `healthy` with zero restarts, and both local and static-ngrok `/ready` reported data schema 1.

## Security and truthfulness checks

- Public card data and mutations are denied until every configured password and participant factor passes.
- Browser sessions use HttpOnly cookies; API credentials, password hashes, encrypted relay data, and connector hashes are stripped from presentations and exports.
- Trello relay assignment, owner watching, notification-health reporting, signed webhook validation, conservative reply routing, retry, and idempotency have regression coverage.
- Authenticated HTTP integration tests prove that one account cannot list, read, update, toggle, inspect statistics for, or delete another account's share; every direct-object attempt returns the same concealed 404 and leaves the owner record unchanged.
- Attachment names are normalized against traversal, control-character, header-injection, Unicode, length, and Windows reserved-name cases. The owner's Trello credential is only sent to an exact trusted HTTPS Trello origin, and redirects are rejected so the credential cannot be forwarded to an attachment-controlled host.
- Payment-page navigation cannot grant credits. Client-declared billing/resource-success endpoints and fake dashboard behavior were removed.
- Tracked secret-bearing environment files were removed. A full redacted Gitleaks scan measured 30 historical candidates across eight commits: 20 in `.env.docker`, five in generated dependency artifacts, and five documentation placeholders. The current PR range has zero findings, and CI now scans changed history on every push or pull request. Any real credential that existed in Git history must still be rotated by its owner; removing the current file or passing the new-change gate does not revoke it.

## Required live acceptance

Before calling the deployment production-live, complete the operator checklist in `docs/ACCEPTANCE_TESTS.md`: rotate historical credentials; configure a dedicated ShareT Trello relay and confirm SMTP delivery; run a real freelancer comment to Trello bell to mobile owner reply to verified-email cycle; activate and revoke the ShareT source in HAI; and test optional CouchDB conflict recovery.
