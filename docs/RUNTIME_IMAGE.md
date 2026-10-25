# Production runtime image

The frontend and backend dependency build stages use the pinned official Node
26.12.1 image. The final image uses pinned Alpine 3.24.3, its normal signed
`libstdc++`, `libatomic` and CA certificate packages, the exact Node executable
from that official source image, the complete installed backend dependency tree,
all backend source and the compiled frontend. npm and Yarn remain build tools;
they are never copied into a production layer. No application module, original
case, dependency lock, advisory or source-scanning rule is excluded.

Qualification independently reads the Node executable SHA-256 and bundled
component versions from the pinned official source image and requires exact
equality with the final runtime. Build-stage package-manager vulnerabilities
remain a separate qualification concern; a clean final-runtime scan does not
establish that all build tools or their bundled dependencies are current.

The production command remains `node server.js`. The default identity is
`10001:10001`. Image qualification reads and executes the unchanged backend
`scripts.test` command, `node --test test/*.test.js`, inside this final image.
There are no declared `pretest` or `posttest` lifecycle scripts; qualification
fails if that assumption changes. Every original case file is hash verified.
The original Docker healthcheck runs with isolated fixture credentials and
temporary data, with no network access. The complete final image is scanned at
every severity and retained for independent byte inspection.

This is a proposal, not a deployment. Existing production data volumes may be
owned by root. Before rollout, inventory ownership, take and verify a recoverable
backup, and prepare an approved ownership migration and rollback for the real
volume. Do not recursively change ownership or replace existing operator data
as part of an image build. Provider behavior, backups/restoration, TLS, live
Trello/billing and operator data require separate acceptance.
