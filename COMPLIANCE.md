# ShareT compliance and truthfulness review

Updated: 2026-08-09

This is a risk register, not a certification claim.

| Area | Current result | Evidence or limit |
| --- | --- | --- |
| Sessions | Implemented | Browser JWTs use HttpOnly, SameSite cookies; explicit bearer opt-in remains for non-browser clients. |
| Link authorization | Implemented | Password and verified-recipient grants are checked before Trello card data is fetched. |
| Ownership | Implemented | Owner routes scope links and connected accounts to the authenticated user. |
| Secrets | Implemented in current tree | Trello and relay tokens are encrypted at rest; API tokens are hashed. Historical committed environment files still require credential rotation. |
| Web security | Implemented | Explicit production CORS, CSP, Helmet, rate limits, bounded JSON bodies, upload limits, and safe filenames. |
| Privacy | Implemented | Account export/deletion, hashed IP logging, configurable retention, privacy and terms pages. |
| Trello notifications | Implemented in code; live-provider acceptance pending | A distinct relay is assigned to the card and posts an attributed comment. Trello credentials and board membership must be configured by the operator. |
| Freelancer replies | Implemented in code; live-provider acceptance pending | Signed webhooks plus a polling recovery path route normal owner replies to verified email recipients. SMTP and a public callback are required. |
| Power-Up | Not applicable | Removed. The owner replies normally in Trello web or mobile. |
| HAI | Implemented | Scoped, revocable connector tokens and an OpenAPI 3.1 endpoint. Live HAI import remains an operator acceptance step. |
| Windows 11 | Implemented in scripts; clean-machine acceptance pending | `install.bat`, `start-sharet.bat`, doctor, backup, restore, and support-bundle commands are present. |
| ngrok | Implemented in configuration; live tunnel acceptance pending | Docker Compose uses a static domain and explicit `.env.docker` interpolation. |
| Resource pricing | Not exposed | Prototype client-declared metering/payment endpoints were removed because they were not trustworthy billing evidence. |
| Accessibility | Partial | Semantic controls and labels are present; a complete keyboard/screen-reader audit is still required. |
| Browser matrix | Partial | Current Chromium browser flow is tested locally; Firefox, Safari, and mobile-device acceptance remain. |

Production readiness is conditional on the operator gates in `docs/OPERATIONS.md` and the live-provider checks in `docs/ACCEPTANCE_TESTS.md`.
