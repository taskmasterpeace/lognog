FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 and git for npm
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY api/package*.json ./

# Install dependencies
RUN npm install

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
COPY api/package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

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
