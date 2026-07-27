# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build the Vite/React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-bullseye-slim AS builder

WORKDIR /build

# Copy dependency manifests first (layer-cache friendly)
COPY package.json ./

# Install all deps (including devDeps needed for Vite build)
RUN npm install

# Copy full source
COPY . .

# Build the React frontend → /build/dist
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Runtime image with EDA tools
# ─────────────────────────────────────────────────────────────────────────────
FROM ubuntu:22.04

LABEL name="VerilogBlocks" \
      description="Visual Verilog IDE — sky130 PDK, event-driven simulation, STA" \
      maintainer="VerilogBlocks IDE"

# Prevent interactive prompts during apt
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=3000

# ── System packages ───────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # EDA tools
    yosys \
    iverilog \
    # Node.js runtime (from NodeSource below)
    curl \
    ca-certificates \
    gnupg \
    # Useful for debugging inside container
    procps \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 20 (NodeSource) ───────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Verify tools ──────────────────────────────────────────────────────────────
RUN echo "=== Tool versions ===" \
    && node   --version \
    && yosys  --version \
    && iverilog -V 2>&1 | head -1

# ── App setup ────────────────────────────────────────────────────────────────
WORKDIR /app

# Production Node deps only (no devDeps)
COPY package.json ./
RUN npm install --omit=dev

# Copy built frontend from Stage 1
COPY --from=builder /build/dist ./dist

# Copy server and runtime files
COPY server/    ./server/
COPY pdk/       ./pdk/
COPY public/    ./public/
COPY preload.js ./preload.js
COPY electron-main.js ./electron-main.js

# Persistent data directories (mount these as volumes)
RUN mkdir -p /app/projects /app/synthesis/output /app/pdk/user-blocks /pdk

# ── PDK environment variables ─────────────────────────────────────────────────
# Override these at runtime with -e flags or in docker-compose.yml
ENV SKY130_PDK_ROOT=""
ENV GF180_PDK_ROOT=""
ENV IHP130_PDK_ROOT=""

# ── Expose port ───────────────────────────────────────────────────────────────
EXPOSE 3000

# ── Health check ──────────────────────────────────────────────────────────────
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# ── Start ─────────────────────────────────────────────────────────────────────
CMD ["node", "server/server.js"]
