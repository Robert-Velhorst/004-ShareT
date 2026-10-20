# App-wide bug hunt

Updated: 2026-08-09

| Finding | Resolution |
| --- | --- |
| Restricted share fetched Trello card data before password/email authorization. | Authorization now runs first for every content/action route. |
| Password-protected endpoints did not consistently carry the password grant. | Signed per-share grant is stored in session storage and attached to every protected request. |
| Trello credentials and share relay tokens were plaintext and serialized. | Encrypted at rest with automatic migration; public/owner presenters redact them. |
| Browser auth depended on localStorage bearer tokens. | HttpOnly cookie sessions; bearer response is explicit opt-in only. |
| Trello OAuth callback still sent `Bearer null` after the cookie migration. | Callback now uses the existing same-origin cookie and an external CSP-compatible script. |
| OAuth callback accepted an arbitrary origin. | Production callback origin is restricted to configured trusted origins. |
| Previous links silently fell back to stale localStorage data. | It now reports the server failure and offers a retry. |
| History stopped at a fixed subset. | Backend pagination and UI page navigation expose the full history. |
| Credit lookup failed open to unlimited. | It fails closed and creation is blocked until the server balance is known. |
| List sharing could start despite an obviously insufficient balance. | Frontend preflight blocks before the first card request. |
| Password reset URL could be returned/logged when production mail was absent. | Reset URL fallback is development-only; production remains non-enumerating. |
| Billing endpoints let users claim paid/refunded without a provider. | Fake billing and client-declared resource endpoints removed. |
| Static server cached HTML as immutable, causing stale chunk manifests after deployment. | Only hashed assets are immutable; HTML revalidates. |
| Inline callback script required a weak global CSP. | Callback script moved to a same-origin external endpoint; global inline scripts disabled. |
| Production CORS always allowed localhost. | Local origins are development-only. |
| Docker ngrok domain interpolation relied on `env_file`, which Compose does not use for interpolation. | Commands use `docker compose --env-file .env.docker`. |
| Docker health checked liveness instead of readiness. | Dockerfile and Compose now check `/ready`. |
| Alpine resolved the Docker health probe's `localhost` to IPv6 while ShareT listened on IPv4. | Dockerfile and Compose now probe `127.0.0.1`, and the rebuilt live container is healthy. |
| The ngrok service inherited every ShareT application secret through `env_file`. | It now receives only `NGROK_AUTHTOKEN` through an explicit environment mapping. |
| The bundled ngrok command used legacy `--domain` syntax. | Compose, Windows launcher, and deployment docs now use the current `--url=https://...` form. |
| Docker-based support bundles ignored `.env.docker` and reported false configuration errors. | The diagnostic loader now includes `.env.docker` while still excluding values and credentials from the report. |
| The installed Windows watchdog used a stale checkout and recreated the live container with its obsolete `/health`/IPv6 probe every two minutes. | Watchdog and redeploy now use `docker compose --env-file .env.docker`, probe IPv4 `/ready`, and allow the full cold-start window. The installed checkout was aligned and a manual watchdog tick left the healthy container unchanged. |
| Account creation displayed `Invalid Date` for legacy users. | Shared user presentation normalizes missing dates to “Not available.” |
| Public errors could expose internal provider failure detail. | Public relay/webhook failure results use stable reason codes. |
| HAI integration required passwords or expiring login JWTs. | Added scoped, hashed, revocable connector credentials and OpenAPI 3.1. |
