# Acceptance and regression matrix

Updated: 2026-08-09

| Scenario | Expected result | Current evidence |
| --- | --- | --- |
| Register/login/reload/logout | HttpOnly session survives reload and logout clears it. | Passed in local Chromium QA. |
| Invalid registration/password | Invalid email and passwords outside 8–128 characters are rejected. | Controller validation; automated suite pending dedicated cases. |
| Trello OAuth callback | Callback posts the fragment token with the existing secure cookie; no browser token storage. | Code/build verified; live Trello acceptance pending. |
| Protected link with password and allowed email | No Trello data is fetched until both factors pass. | Automated test passes. |
| Secret responses | Password, relay token, encrypted token, and connector hash never appear. | Automated presentation/export tests pass. |
| Freelancer comment | Relay is assigned if missing; comment includes freelancer name and owner notification is assessed. | Automated provider-response tests pass; live Trello pending. |
| Owner reply from Trello mobile | Signed webhook routes a unique reply to the correct verified participant. | Routing/signature tests pass; live Trello+SMTP pending. |
| Ambiguous reply | No email is guessed; event waits in Admin. | Automated routing tests pass. |
| Previous link history >25 | API and UI expose every page, newest first. | Pagination tests pass; browser large-history pass pending. |
| Search target picker | One picker searches workspace, board, list, card, and ID and shows hierarchy. | Build/lint pass; live large-board performance pending. |
| Credit service failure | UI blocks creation instead of granting unlimited use. | Code inspection and build pass. |
| Duplicate share | Existing active link is reused and no credit is spent. | Automated test passes. |
| HAI read-only credential | Hash is stored, secret shown once, expiry and revocation enforced. | Automated token test passes; live HAI import pending. |
| HAI write scope | Read-only token receives 403; write token can use validated share endpoints. | Local HTTP integration passed; live HAI import pending. |
| Account export/delete | Export is redacted; deletion removes owned records only. | Automated redaction plus local endpoint lifecycle passed. |
| Maintenance/public kill switch | Mutations or all public links fail closed with explicit 503. | Code present; runtime smoke pending. |
| Static deployment update | HTML revalidates; hashed assets cache immutably; reload does not request obsolete chunks. | Response-header and rebuild/restart browser smoke passed. |
| Windows standalone | Clean install, doctor, start, health, backup, restart. | Clean installs, doctor, start/readiness, restart, and isolated backup/restore passed on Windows 11; independent-machine acceptance pending. |
| Docker/ngrok | Compose substitutes static domain and public `/ready` works. | Live Windows Compose stack is healthy; local and static-ngrok `/ready` return 200. Ngrok receives only its own credential. |
| CouchDB sync | All active databases replicate and reconnect. | Code present; live CouchDB conflict/recovery pass pending. |

## Automated commands

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run build
Push-Location backend
npm.cmd ci
npm.cmd test
npm.cmd audit --omit=dev
Pop-Location
npm.cmd audit --omit=dev
git diff --check
```

## Live-provider gate

Do not mark the provider path production-accepted until a real freelancer comment makes the Trello bell unread, a normal owner mobile reply reaches the verified test inbox once, the public webhook signature succeeds, revocation blocks the old URL, and no credential appears in browser storage, API responses, logs, exports, or the support bundle.
