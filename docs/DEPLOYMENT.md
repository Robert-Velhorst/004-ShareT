# ShareT Deployment

ShareT is a Node/Express backend that serves the API and, after a frontend build, the frontend files as well.

Production must run on Hetzner behind a stable public HTTPS URL. Local development can use localhost.

## Recommended options

### Hetzner production host

Use the repository's Hetzner deployment workflow in [`deploy/README.md`](../deploy/README.md). Run the backend as a long-running Node process behind HTTPS, for example with Caddy or Nginx. Configure DNS, TLS, secrets, persistent data, monitoring, backups, and rollback before cutover.

### Local development

Run the app on localhost without exposing it through a public tunnel:

```bash
npm install
npm run build
cd backend
npm install
npm start
```

## Required environment values

```env
PORT=5005
PUBLIC_URL=https://your-stable-sharet-domain.example
FRONTEND_URL=https://your-stable-sharet-domain.example
CORS_ORIGIN=https://your-stable-sharet-domain.example
TRELLO_API_KEY=...
TRELLO_API_SECRET=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
ENCRYPTION_KEY=...
```

## HAI connector

Open the ShareT profile and select **HAI connector**. Create a read-only credential and copy its one-time value into HAI as `HAI_SHARET_CONNECTOR_TOKEN`. Set `HAI_SHARET_ENABLED=true`, set `HAI_SHARET_BASE_URL` to the displayed stable ShareT origin, restart HAI, and create the native `sharet` source with `localOnly=false` and an empty sync target. The public OpenAPI contract remains at `/api/connector/openapi.json` for other reviewed clients; all data operations require a scoped token. Credentials expire after 90 days by default and can be revoked immediately from ShareT.

## Trello notifications for external freelancers

Freelancers do not need to sign in to Trello. Configure a dedicated Trello relay account such as `ShareT Updates`, add that account to the relevant Trello boards, and put its token in:

```env
TRELLO_BOT_TOKEN=...
SHARET_TRELLO_NOTIFY_USERNAME=noodzakelijkonline
```

The relay account must be different from the account named by `SHARET_TRELLO_NOTIFY_USERNAME`. Trello does not create notifications for actions performed by the same member, so the owner-token fallback can deliver a comment but cannot turn that owner's bell red.

When a freelancer submits a ShareT comment, ShareT checks whether the relay is assigned to that card and adds it automatically when missing. The relay only needs to be added to each relevant board once; no manual card-by-card monitoring is required. ShareT then posts the update through the relay account and directly mentions the configured Trello username. The freelancer's name is the first, bold part of the comment. The Admin tab reports whether the shared relay is configured, and each successful comment response records both `relayAssignment` and `bellExpected`.

If the relay is not a member of the board, Trello will reject the automatic card assignment. Add the relay to the board and retry the ShareT comment. For strict notification delivery, set `SHARET_ALLOW_OWNER_COMMENT_FALLBACK=false` so an assignment problem cannot silently fall back to the owner's token.

### Native Trello author names

Trello's comment API does not accept an author override: the visible author is always the member that owns the posting token. If a freelancer must appear in Trello's native author row, create a clearly attributed admin-managed relay account such as `Kamal Uddin via ShareT`, add it to the board, and put its token in the share's `Native Trello Author Token` advanced option.

The freelancer never needs the account credentials or access to Trello. A single shared relay account cannot safely rotate its display name between freelancers because Trello member identity is account-wide.

There are therefore two supported modes:

- Shared relay: one ShareT Trello account, compact bold freelancer name in the comment, and a normal owner notification.
- Per-freelancer relay: native Trello author name plus a normal owner notification, still without requiring the freelancer to use Trello.

## Freelancer email verification and reply tracking

Comment-enabled links now require the freelancer to enter a name and verify an email address on first access. ShareT remembers the verified browser session for that link and associates each freelancer comment with the verified email.

The Trello owner can reply normally in Trello web, desktop, or the mobile app. ShareT creates a signed webhook for each active comment-enabled card and processes the owner's `commentCard` action immediately. No Power-Up, special reply link, or ShareT reply screen is required.

Reply routing is deliberately conservative:

- If one freelancer is awaiting a reply on the card, that person is notified automatically.
- If several are waiting, a normal name mention such as `Kamal, tonight would be great` selects that freelancer.
- If several are waiting and no unique name is present, ShareT sends nothing to avoid exposing a reply to the wrong person. The event appears in the Admin tab for one-click resolution.

Webhook requests are verified with `TRELLO_API_SECRET`, persisted by Trello action ID, and processed once. Failed mail is retried with exponential backoff. Multiple pending updates from the same selected freelancer are combined into one reply email.

While the ShareT page is open, comments refresh every 30 seconds and immediately when the tab becomes visible again. A server-side monitor checks pending conversations every 60 seconds by default as a recovery path, so reply emails still work if a webhook is delayed or unavailable.

`PUBLIC_URL` must be a stable, publicly reachable URL for Trello's callback validation. ShareT derives the webhook URL as `${PUBLIC_URL}/api/trello-webhooks/callback`. Set `TRELLO_WEBHOOK_CALLBACK_URL` only when the callback must use a different public origin or path.

Configure SMTP for verification codes and freelancer reply emails. The Docker deployment uses the existing `EMAIL_*` variables:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
EMAIL_FROM=ShareT <your_gmail@gmail.com>
SHARET_REPLY_POLL_INTERVAL_MS=60000
SHARET_PARTICIPANT_SESSION_DAYS=90
```

The backend also accepts the equivalent `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` names.

For extra owner-side reliability, optionally configure the existing email fallback:

```env
SHARET_NOTIFY_EMAIL_TO=you@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=ShareT <notifications@example.com>
```

This keeps the Trello card as the source of truth while making both sides of the conversation independently trackable.
