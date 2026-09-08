# ==============================================================================
# Stage 1: Build Stage (compiles native dependencies and mediasoup C++ worker)
# ==============================================================================
FROM node:24-bookworm-slim AS builder

WORKDIR /usr/src/app

# Install native build tools required for mediasoup-worker compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (triggers mediasoup C++ worker native compilation)
RUN npm ci

# Deterministically prune devDependencies, keeping only production dependencies
# and the compiled native mediasoup-worker binary in node_modules
RUN npm prune --omit=dev

# ==============================================================================
# Stage 2: Production Runtime Stage (minimal, secure, unprivileged)
# ==============================================================================
FROM node:24-bookworm-slim AS runner

WORKDIR /usr/src/app

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=4000

# Install runtime dependencies if necessary and clean apt cache
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests and strictly pruned production dependencies
COPY --chown=node:node package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations

# Enforce non-root execution
USER node

# Expose HTTP API / WebSocket port and WebRTC UDP media port range
EXPOSE 4000
EXPOSE 40000-49999/udp

# Node-native lightweight health check (avoids installing curl in production image)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Start the application server
CMD ["node", "src/server.js"]
