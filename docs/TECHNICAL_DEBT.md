# Technical debt and roadmap

| Priority | Item | Why it remains |
| --- | --- | --- |
| P0 operator | Rotate all credentials previously committed to Git history. | Code cannot revoke external secrets. |
| P0 acceptance | Complete live Trello relay, owner mobile reply, SMTP, and native HAI source activation tests. | Requires owner accounts and public provider state. |
| P1 | Add HTTP-level connector-scope and maintenance-mode tests. | Cross-user isolation and adversarial attachment boundaries now have dedicated integration coverage; these two runtime gates remain unit/code-inspection only. |
| P1 | Add React component tests and a Firefox/mobile browser matrix. | Current evidence is lint/build plus Chromium QA. |
| P1 | Add resumable multi-step repair tooling for future data transformations. | Versioned, idempotent migrations and unsafe-downgrade rejection are implemented; a general operator repair command is not. |
| P1 | Replace or isolate PouchDB's legacy UUID dependency when upstream provides a safe path. | Backend audit has 0 high/critical and 7 moderate reports through PouchDB's UUID dependency; npm's current automatic fix is an unsafe downgrade from PouchDB 8 to 6. |
| P2 | Add Dutch translations and locale switching. | English is currently the only shipped copy. |
| P2 | Add a first-run provider checklist/wizard. | Doctor and contextual warnings cover function but not a guided tour. |
| P2 | Add production-size performance fixtures and response budgets. | Current optimization evidence is structural and build-size based. |
| P2 | Define multi-owner team/workspace roles if ShareT becomes multi-tenant SaaS. | Current model is single owner plus administrator. |

Do not reintroduce client-declared resource metering or payment-success endpoints. Trusted billing requires server-side measurement, provider reconciliation, signed webhooks, auditability, and a separate commercial decision.
