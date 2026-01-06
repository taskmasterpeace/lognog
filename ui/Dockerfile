# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json only (not lock file to avoid platform issues)
COPY package.json ./

# Install dependencies fresh for Linux (--legacy-peer-deps for echarts/wordcloud compatibility)
RUN npm install --legacy-peer-deps

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
