# ---- Build stage ----
FROM node:20-slim AS builder

# Build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install root deps (including dev deps for build)
COPY package*.json ./
RUN npm ci

# Install client deps
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy source
COPY . .

# Build: client (Vite) + server (TypeScript)
RUN npm run build

# Prune to production deps only
RUN npm ci --omit=dev

# ---- Production stage ----
FROM node:20-slim AS production

RUN apt-get update && apt-get install -y libstdc++6 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Data directory for SQLite files (mapped to Fly volume)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/server/server/index.js"]
