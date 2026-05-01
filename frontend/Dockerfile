# ============================================================
# Stage 1 — Build React app
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ============================================================
# Stage 2 — Serve with Nginx
# ============================================================
FROM nginx:1.25-alpine

# Custom nginx config — proxy /api and /ws to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1
