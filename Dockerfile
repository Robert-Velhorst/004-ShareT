# Keep build tools in build stages; copy the same pinned Node executable into
# a clean runtime filesystem so npm/Yarn are absent from every runtime layer.
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS node-source

FROM node-source AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Keep frontend and backend cache boundaries independent. Server-only changes
# must not force Vite to rebuild all frontend modules.
COPY index.html vite.config.js postcss.config.js tailwind.config.cjs ./
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# Install the unchanged backend lock with the normal package manager before
# copying the complete installed backend dependency tree into production.
FROM node-source AS backend-dependencies
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Production uses the same stable Alpine release as the pinned Node source.
FROM alpine:3.24.3@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a AS production
RUN apk add --no-cache libstdc++ libatomic ca-certificates
COPY --from=node-source /usr/local/bin/node /usr/local/bin/node
RUN ldd /usr/local/bin/node && node --version
WORKDIR /app
COPY --from=backend-dependencies /app/backend/ ./backend/
COPY backend/ ./backend/

# Copy built frontend to backend's serving directory
COPY --from=frontend-build /app/dist ./backend/frontend/dist

# Create data directory for PouchDB
RUN mkdir -p /app/backend/data && chown 10001:10001 /app/backend/data

WORKDIR /app/backend

# Environment
ENV NODE_ENV=production
ENV PORT=5005
ENV DATA_DIR=/app/backend/data

EXPOSE 5005

# Existing deployment volumes require a reviewed ownership migration before
# rollout. Building the image never changes existing operator data.
USER 10001:10001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5005/ready || exit 1

CMD ["node", "server.js"]
