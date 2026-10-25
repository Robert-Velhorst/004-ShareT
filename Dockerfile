# Multi-stage build for ShareT
# Stage 1: Build frontend
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Keep frontend and backend cache boundaries independent. Server-only changes
# must not force Vite to rebuild all frontend modules.
COPY index.html vite.config.js postcss.config.js tailwind.config.cjs ./
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# Stage 2: Production server
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS production
WORKDIR /app

# Copy backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

COPY backend/ ./backend/

# Copy built frontend to backend's serving directory
COPY --from=frontend-build /app/dist ./backend/frontend/dist

# Create data directory for PouchDB
RUN mkdir -p /app/backend/data

WORKDIR /app/backend

# Environment
ENV NODE_ENV=production
ENV PORT=5005
ENV DATA_DIR=/app/backend/data

EXPOSE 5005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5005/ready || exit 1

CMD ["node", "server.js"]
