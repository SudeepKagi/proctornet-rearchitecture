# ==============================================================================
# Stage 1: Frontend Build Stage
# ==============================================================================
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy source code and build config
COPY . .

# Compile production bundle into dist/
RUN npm run build

# ==============================================================================
# Stage 2: Static Delivery & TLS Reverse Proxy via Unprivileged Nginx
# ==============================================================================
FROM nginxinc/nginx-unprivileged:alpine AS runner

# Create mount points for Let's Encrypt certificates and Certbot ACME webroot
# Generate fallback self-signed certificates so Nginx can validate SSL configuration
USER root
RUN mkdir -p /etc/letsencrypt/live/proctornet /var/www/certbot /usr/share/nginx/html && \
    apk add --no-cache openssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/letsencrypt/live/proctornet/privkey.pem \
      -out /etc/letsencrypt/live/proctornet/fullchain.pem \
      -subj "/CN=localhost" && \
    apk del openssl && \
    chown -R nginx:nginx /var/www/certbot /usr/share/nginx/html /etc/letsencrypt
USER nginx

# Copy custom Nginx configuration
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder
COPY --from=builder --chown=nginx:nginx /usr/src/app/dist /usr/share/nginx/html

# Expose unprivileged HTTP (8080) and HTTPS (8443) ports
EXPOSE 8080 8443

# Healthcheck verifying Nginx is responsive on HTTP/HTTPS
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8080/.well-known/acme-challenge/ || wget -q -O /dev/null --no-check-certificate https://localhost:8443/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
