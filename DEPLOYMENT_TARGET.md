

# Deployment target

Hetzner is the target for production deployment. Do not use unapproved serverless hosting or public-tunnel services for production. No active unapproved serverless hosting or public-tunnel services production deployment is intended; do not claim a migration or cutover until the running service, data, secrets, security controls, backups, and rollback path have been verified.

Preserve local development and test tooling when it is still needed, but do not use unapproved serverless hosting or public-tunnel services for new production deployments. Document the Hetzner architecture, required infrastructure, deployment steps, data and database migration, DNS/TLS, secrets, monitoring, backups, and rollback in the project deployment guide before cutover. Keep credentials and private data out of this file.
