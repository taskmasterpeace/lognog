FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 and git for npm
RUN apk add --no-cache python3 make g++ git

# Copy package files (lockfile included — the build must resolve the exact
# versions that pass locally; an unpinned install is how the UI image broke)
COPY api/package.json api/package-lock.json ./

# Install dependencies from the lockfile
RUN npm ci

# Copy source code
COPY api/tsconfig.json ./
COPY api/src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3, git, and sqlite3 for backups
RUN apk add --no-cache python3 make g++ git sqlite

# Copy package files
COPY api/package.json api/package-lock.json ./

# Install production dependencies only, pinned to the lockfile
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Help-bot retrieval corpus (chunked user guide). Read at runtime by the
# /api/ask-docs route. Regenerated from docs/ on each release.
COPY docs/guide-index.json ./guide-index.json

# Integration guide for AI coding agents, served at GET /api/ingest/guide
# (markdown for agents/curl, rendered HTML for browsers).
COPY docs/LOGNOG-AGENT-GUIDE.md ./agent-guide.md
COPY docs/LOGNOG-AGENT-GUIDE.html ./agent-guide.html

# Create data and backup directories
RUN mkdir -p /data /backups

# Copy backup scripts
COPY scripts/backup-sqlite.sh scripts/backup-entrypoint.sh ./scripts/
RUN chmod +x ./scripts/*.sh

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -q --spider http://localhost:4000/health || exit 1

# Start server with backup cron
CMD ["/app/scripts/backup-entrypoint.sh"]
