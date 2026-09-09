# ── Stage 1: Build Vite/React frontend ───────────────────────────────────────
FROM node:20-bullseye-slim AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ── Stage 2: Runtime with EDA tools + atalanta ATPG ──────────────────────────
FROM ubuntu:22.04
LABEL name="VerilogBlocks"
ENV DEBIAN_FRONTEND=noninteractive NODE_ENV=production PORT=3000

# EDA tools + build deps + python3 (for JSON→bench converter)
RUN apt-get update && apt-get install -y --no-install-recommends \
    yosys iverilog gtkwave \
    gcc g++ make \
    python3 \
    curl ca-certificates gnupg procps \
    && rm -rf /var/lib/apt/lists/*

# ── Compile atalanta ATPG from source ─────────────────────────────────────────
# Source: hsluoyz/Atalanta (mirrors original Virginia Tech atalanta 2.0)
# Non-fatal: ATPG UI shows a clear error message if atalanta is unavailable.
# Note: write_bench was removed from Yosys ≥0.26; we use write_json +
#       server/yosys_json_to_bench.py to produce ISCAS89 bench format.
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && wget -q -O /tmp/atalanta.tar.gz \
       https://github.com/hsluoyz/Atalanta/archive/refs/heads/master.tar.gz \
    && tar -xzf /tmp/atalanta.tar.gz -C /tmp \
    && cd /tmp/Atalanta-master \
    && make -f makefile \
    && cp atalanta /usr/local/bin/atalanta \
    && chmod +x /usr/local/bin/atalanta \
    && rm -rf /tmp/Atalanta-master /tmp/atalanta.tar.gz \
    && apt-get remove -y wget && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    || (echo "WARNING: atalanta build failed — ATPG unavailable" && true)

# ── Node.js 20 LTS ────────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Diagnostic — never fails the build
RUN node --version; \
    (yosys -V || yosys --version || true); \
    (iverilog -V 2>&1 | head -1 || true); \
    python3 --version; \
    (atalanta 2>&1 | grep -i "version\|atalanta" | head -1 || echo "atalanta: not built"); \
    true

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /build/dist ./dist
COPY server/ ./server/
COPY pdk/ ./pdk/
COPY public/ ./public/
COPY electron-main.js preload.js ./
RUN mkdir -p /app/projects /app/synthesis/output /app/pdk/user-blocks /pdk /app/atpg

ENV SKY130_PDK_ROOT="" GF180_PDK_ROOT="" IHP130_PDK_ROOT=""
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["node", "server/server.js"]
