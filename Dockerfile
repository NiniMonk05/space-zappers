# Build stage for game client
FROM node:20-alpine AS builder
WORKDIR /app

# Game pubkey for leaderboard queries (public, derived from GAME_NSEC)
ARG VITE_GAME_PUBKEY=6c95ab59b0ebf56296f45b8b52b9b0f2599029c173a8c5fd463ef0a474995fcc
ENV VITE_GAME_PUBKEY=$VITE_GAME_PUBKEY

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage - Nginx + Score Service
FROM node:20-alpine

# Install nginx and tini (PID 1: forwards SIGTERM, reaps children)
RUN apk add --no-cache nginx tini

# Set up score service
WORKDIR /score-service
COPY score-service/package*.json ./
RUN npm ci --only=production
COPY score-service/index.js score-service/invoices.js ./

# Copy built game files and fix permissions
COPY --from=builder /app/dist /usr/share/nginx/html
RUN chmod -R 644 /usr/share/nginx/html/* && chmod 755 /usr/share/nginx/html /usr/share/nginx/html/assets

# Nginx config - serves static files and proxies /api to score service
RUN mkdir -p /etc/nginx/http.d && echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass http://127.0.0.1:3002/; \
        proxy_http_version 1.1; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    } \
}' > /etc/nginx/http.d/default.conf

# Start script - supervises nginx and the score service (bound to 127.0.0.1); LNBITS_URL, LNBITS_INVOICE_KEY and GAME_NSEC are read from the container env at runtime
COPY docker/start.sh /start.sh
RUN chmod 755 /start.sh

EXPOSE 80

# Healthy only when nginx proxies to a score service that has invoices configured
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1/api/health | grep -q '"invoices":true' || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/start.sh"]
