# Architecture and product contract

## User outcome

ShareT lets a Trello owner give a freelancer controlled access to one card without requiring the freelancer to have a Trello account. The owner continues to work from Trello web or mobile. The freelancer uses the share page and verified email.

## Critical path

1. The owner authenticates with a secure browser session.
2. The owner connects Trello and selects a card or list through the structured picker.
3. ShareT validates and persists the share policy before returning a URL.
4. A recipient must satisfy active-state, expiry, password, and allowed-email rules before ShareT fetches private Trello data.
5. Permitted actions are relayed to Trello and recorded without exposing credentials.
6. The dedicated relay is added to the card automatically and posts the freelancer's attributed comment so Trello can generate a normal owner notification.
7. A signed webhook detects the owner's normal Trello reply; conservative routing emails the correct verified freelancer. A bounded polling monitor is recovery, not the primary path.
8. Deactivation, expiry, deletion, maintenance mode, or the public-access kill switch stops access cleanly.

## Components

| Component | Responsibility |
| --- | --- |
| React/Vite frontend | Owner dashboard, target search, link policy form, history, recipient view, account and HAI settings. |
| Express API | Validation, auth, ownership, provider orchestration, public policy enforcement, health and diagnostics. |
| PouchDB | Local-first durable documents and indexes. No separate database install is required on Windows. |
| Optional CouchDB | Live replication for an operator-managed remote copy; not required for local operation. |
| Trello API | Source of card content and destination for comments/files/due dates. |
| SMTP | Email verification and owner-reply delivery. |
| Trello webhook | Immediate reply events; HMAC signature validation and action-id idempotency are required. |
| HAI connector | OpenAPI 3.1 surface authenticated with scoped, hashed, expiring credentials. |

## Data ownership and invariants

- Every share has exactly one owner `userId` and one stable random `shareId`.
- Owner APIs never return password hashes, relay tokens, or encrypted credential fields.
- A password grant is signed and scoped to one share.
- A participant grant is random, persisted as participant state, and scoped to one share and verified email.
- Password and recipient restrictions compose: satisfying one never bypasses the other.
- Trello credentials are encrypted at rest. HAI credentials are one-way hashed and shown only once.
- A webhook action is processed once. Ambiguous replies are held for an administrator instead of guessed.
- The browser is not trusted to decide credits, permissions, ownership, or payment completion.

## Performance and resource choices

- Target search is in-memory over the already fetched Trello hierarchy; grouping and counts are memoized.
- Share history is paginated at the database/API boundary and the UI loads 25 rows at a time.
- PouchDB indexes cover user, share, participant, thread, webhook, and connector-token lookups; auto-compaction is enabled.
- Static hashed assets cache for one year; HTML is always revalidated so deployments cannot retain a stale asset manifest.
- Compression skips small responses. JSON requests are capped at 1 MB and uploads at 10 MB.
- Connector `lastUsedAt` writes are throttled to once per hour per credential.
- Polling intervals are configurable and unref'd timers do not prevent clean process shutdown.

## Deliberate exclusions

- No Trello Power-Up panel.
- No AI provider or mock provider.
- No browser-side payment success or self-declared resource metering.
- No claim that Trello or SMTP works until credentials and live provider acceptance succeed.
