# ShareT

ShareT creates secure external links for Trello cards so freelancers can view work, upload files, and post updates without needing a Trello account.

Freelancer updates are relayed into Trello by a dedicated ShareT member. ShareT automatically assigns that member to the card when needed, mentions the Trello owner, and includes the freelancer's name in the comment. The owner can reply normally from Trello web, desktop, or mobile. Verified freelancers receive those replies by email and can also see them when the shared page refreshes.

## Main capabilities

- Share one Trello card or all cards in a list.
- Search Trello content by workspace, board, list, or card from one structured picker.
- Protect a link with a password and optional expiry date.
- Require a freelancer's name and verified email before commenting.
- Relay freelancer comments through a dedicated Trello bot account.
- Automatically add the relay member to a card before its first relayed comment.
- Trigger a normal Trello mention notification for the configured owner.
- Route normal Trello replies back to the correct freelancer by email.
- Preserve complete share-link history with pagination, copy, QR, status, and delete controls.
- Store data locally in PouchDB, with optional CouchDB synchronization.

No Trello Power-Up panel is required for the conversation flow.

## Requirements

- Current Node.js 22 LTS (22.22.2+) or a supported newer LTS; prepaid backend requires Node 22.13+ for SQLite
- A Trello API key and secret
- A stable public HTTPS URL for production OAuth callbacks and Trello webhooks
- SMTP credentials for freelancer verification and reply email
- A separate Trello member and token for reliable unread bell notifications

## Windows installation

1. Clone the repository.
2. Run `install.bat`.
3. Configure `backend\.env` using the comments in `backend\.env.example`.
4. Run `start-sharet.bat`.
5. Open `http://localhost:5005`.

The installer installs both dependency sets, builds the frontend, copies the production build, and creates `backend\.env` when it is missing.

## Manual installation

```bash
npm ci
npm run build

cd backend
npm ci
cp .env.example .env
# Edit .env before starting ShareT.
npm start
```

The backend serves the frontend build from the repository's `dist` directory or from `backend/frontend/dist`. The default local URL is `http://localhost:5005`.

## Essential configuration

Start from `backend/.env.example`. Production secrets must be unique and must not use the development defaults.

```env
PORT=5005
NODE_ENV=production

PUBLIC_URL=https://sharet.example.com
FRONTEND_URL=https://sharet.example.com
CORS_ORIGIN=https://sharet.example.com

JWT_SECRET=replace-with-a-long-random-secret
SESSION_SECRET=replace-with-another-long-random-secret
ENCRYPTION_KEY=replace-with-a-long-random-encryption-key

TRELLO_API_KEY=your-trello-api-key
TRELLO_API_SECRET=your-trello-api-secret
TRELLO_CALLBACK_URL=https://sharet.example.com/api/trello/callback

TRELLO_BOT_TOKEN=token-owned-by-the-sharet-relay-member
SHARET_TRELLO_NOTIFY_USERNAME=your-trello-username
SHARET_ALLOW_OWNER_COMMENT_FALLBACK=false

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=ShareT <notifications@example.com>
```

The relay token must belong to a different Trello member than the owner. Add the relay member to each relevant board once. ShareT handles card-level assignment automatically. An action posted with the owner's own token can create the comment but cannot create an unread notification for that same owner.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for webhook behavior, freelancer reply routing, SMTP aliases, and deployment options.

## Deployment

ShareT is a Node/Express application, not a static-only frontend. It needs an always-running backend and a stable public HTTPS URL. Supported approaches include:

- Docker Compose using `docker-compose.yml`
- A local or always-on Windows machine behind a named Cloudflare Tunnel
- A static ngrok domain
- A VPS or Node hosting platform behind HTTPS

For Docker:

```bash
docker compose up -d --build
docker compose ps
```

The health endpoint is `GET /health`.

## API

Authenticated endpoints expect the JWT returned by `POST /api/auth/login`:

```http
Authorization: Bearer your_access_token
```

### Authentication

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Sign in and obtain tokens |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Read the current profile |
| PUT | `/api/auth/profile` | Update the current profile |
| PUT | `/api/auth/password` | Change the password |

### Trello

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/trello/auth-url` | Start Trello authorization |
| GET | `/api/trello/callback` | Handle Trello's OAuth callback |
| POST | `/api/trello/connect` | Complete a token connection |
| POST | `/api/trello/disconnect` | Remove the current connection |
| GET | `/api/trello/status` | Read connection status |
| GET | `/api/trello/boards` | List visible boards |
| GET | `/api/trello/boards/:boardId/cards` | List cards on a board |
| GET | `/api/trello/boards/:boardId/lists` | List lists on a board |

### Share links

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/shared-links` | Create a share link |
| GET | `/api/shared-links?page=1&limit=25` | List all links with pagination |
| GET | `/api/shared-links/:shareId` | Read a link |
| PUT | `/api/shared-links/:shareId` | Update permissions or status |
| DELETE | `/api/shared-links/:shareId` | Delete a link |
| GET | `/api/shared-links/:shareId/stats` | Read link statistics |

Public recipient operations live under `/api/shared-access/:shareId`. Comment-enabled links require an email verification session before a freelancer can post.

## Credits and payment

ShareT includes an optional prepaid resource wallet, accessible through **Credits & usage** even before connecting Trello. Customers can buy €10, €25, or €50 of resource credits through Stripe Checkout. 100 resource credits represent €1; these are not the old per-share credits.

For each accepted infrastructure receipt, the customer charge is **documented supplier resource cost × 2.5**. The wallet shows purchase history, resource quantities, supplier rates, base costs, and charges. Signed payment notifications and provider verification add credits; a redirect or browser claim cannot do so. Refunds and disputes reconcile the balance. No subscription or automatic recharge is created.

**Disabled by default, not an automatic host meter:** a hosting-specific usage collector, verified supplier rates, Stripe configuration, tax/refund decisions, and operator acceptance are required before activation. This repository provides the signed receipt ingestion and settlement path; it does not currently collect per-customer CPU/RAM/GPU/network counters from your hosting environment. Do not enable paid resource mode without that collector. See [the complete billing setup and limitations](docs/BILLING.md).

When billing is off, existing per-share allowances remain in force. They are preserved without assigning them a cash value. When resource mode is on, creating a share checks the wallet and does not also deduct the old allowance. Guest link activity is funded by the link owner. An empty/held balance pauses share creation and guest access; account, payment and link-management screens remain accessible. Settlement is asynchronous, so this is not a hard real-time spending cap.

Financial state is stored separately in `DATA_DIR/prepaid-test.sqlite` or `prepaid-live.sqlite`, not PouchDB/CouchDB sync. Back up these files consistently with the rest of the data. The old simulated payment and browser-written usage endpoints are retired.

## Verification

```bash
npm run build
npm run test:billing-ui
npx eslint src/App.jsx src/pages/App.jsx

cd backend
npm test
npm audit --omit=dev
```

## Data and backups

PouchDB data is stored in `backend/data` by default or in the directory configured by `DATA_DIR`. Back up that directory while the app is stopped, or configure CouchDB synchronization for an external replica.

## License

MIT
