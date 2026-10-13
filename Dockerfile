# Multi-stage build for ShareT
# Stage 1: Build frontend
FROM node:26-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production server
FROM node:26-alpine AS production
WORKDIR /app

# Copy backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

COPY backend/ ./backend/

# Copy built frontend to backend's serving directory
COPY --from=frontend-build /app/dist ./backend/frontend/dist

# Copy power-up files (served at /power-up/ route)
COPY power-up/ ./power-up/

# Create data directory for PouchDB
RUN mkdir -p /app/backend/data

WORKDIR /app/backend

# Environment
ENV NODE_ENV=production
ENV PORT=5005
ENV DATA_DIR=/app/backend/data

EXPOSE 5005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5005/health || exit 1

CMD ["node", "server.js"]
