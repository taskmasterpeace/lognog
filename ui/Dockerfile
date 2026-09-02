# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install from the lockfile so the image gets the exact versions that pass
# locally. An unpinned `npm install` resolved a newer transitive package that
# crashed `tsc` with SIGTRAP in the builder (2026-09-02) — with the lockfile
# the same sources compile fine under this image.
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
