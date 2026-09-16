# VerilogBlocks IDE — Docker Setup

Run the full IDE in a container. Yosys and Icarus Verilog are pre-installed.
Access via browser at **http://localhost:3000**.

---

## Quick Start

```bash
# 1. Build the image
docker build -t verilogblocks .

# 2. Run with your sky130 PDK mounted (adjust path if different)
docker run -d \
  --name verilogblocks \
  -p 3000:3000 \
  -e SKY130_PDK_ROOT=/pdk/sky130/versions/0fe599b2afb6708d281543108caf8310912f54af \
  -v "$HOME/.ciel/ciel/sky130:/pdk/sky130:ro" \
  -v "$PWD/docker-projects:/app/projects" \
  -v "$PWD/docker-synthesis:/app/synthesis/output" \
  verilogblocks

# 3. Open in browser
open http://localhost:3000
```

---

## Docker Compose (recommended)

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

The `docker-compose.yml` auto-mounts your sky130 PDK from `~/.ciel` and
persists projects to `./docker-projects/` on your host.

---

## Setting the PDK path in the UI

When the IDE loads:
1. The **PDK Selector** opens automatically
2. Under **SkyWater SKY130**, click **Set path ▾**
3. The container path is pre-filled: `/pdk/sky130/versions/0fe599b2…`
4. Click **Validate** — should show **✓ Found**
5. Click **Create Project**

> **Note:** In Docker, paths must be *container-internal* paths (starting with `/pdk/`),
> not your host machine paths. The volume mount translates them automatically.

---

## Persistent Data

| What | Container path | Host path (docker-compose) |
|------|---------------|---------------------------|
| Projects | `/app/projects` | `./docker-projects/` |
| Synthesis output | `/app/synthesis/output` | `./docker-synthesis/` |
| Custom blocks | `/app/pdk/user-blocks` | `./docker-userblocks/` |

Projects are saved automatically when you click **↓ Save** in the toolbar.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SKY130_PDK_ROOT` | Path to sky130 PDK root inside container | `/pdk/sky130/versions/0fe599b2…` |
| `GF180_PDK_ROOT` | Path to GF180 PDK (when installed) | `/pdk/gf180mcuD` |
| `IHP130_PDK_ROOT` | Path to IHP130 PDK (when installed) | `/pdk/ihp-sg13g2` |
| `PORT` | Server port (default: 3000) | `3000` |

---

## Adding Other PDKs

### GF180MCU

```bash
# Download on host
git clone https://github.com/google/gf180mcu-pdk ~/.volare/gf180mcuD

# Add to docker-compose.yml volumes:
# - ${HOME}/.volare/gf180mcuD:/pdk/gf180mcuD:ro

# Add environment variable:
# - GF180_PDK_ROOT=/pdk/gf180mcuD

# Enable in pdk/pdk-registry.json: set "enabled": true for gf180
```

### IHP SG13G2

```bash
git clone https://github.com/IHP-GmbH/IHP-Open-PDK ~/ihp-sg13g2-pdk
# Then add volume mount and IHP130_PDK_ROOT env var
```

---

## Checking Tool Versions

```bash
# Check health endpoint
curl http://localhost:3000/api/health

# Exec into container
docker exec -it verilogblocks bash

# Inside container:
yosys --version
iverilog -V
node --version
```

---

## Development Mode (with hot reload)

For active development, run the Vite dev server and Express backend separately:

```bash
# Terminal 1 — Vite frontend (hot reload)
npm run dev      # → http://localhost:5173

# Terminal 2 — Express API server
npm run server   # → http://localhost:3000/api/*

# The frontend dev server proxies /api/* to :3000 automatically
# (add this to vite.config.js if needed):
# server: { proxy: { '/api': 'http://localhost:3000' } }
```

Or run everything inside Docker with a bind mount for instant code changes:

```bash
docker run -it \
  -p 3000:3000 \
  -v "$PWD/src:/app/src" \
  -v "$HOME/.ciel/ciel/sky130:/pdk/sky130:ro" \
  verilogblocks npm run docker
```

---

## Architecture

```
Browser (http://localhost:3000)
        │
        ▼
┌─────────────────────────────────┐
│  Express Server (server.js)     │
│  port 3000                      │
│                                 │
│  GET  /            → dist/      │  ← Built React app
│  GET  /pdk/*       → pdk/       │  ← PDK manifests
│  POST /api/yosys/synth          │  ← Spawns: yosys -s synth.ys
│  POST /api/sim/run              │  ← Spawns: iverilog + vvp
│  GET  /api/pdk/*                │  ← Reads Liberty files
│  *    /api/project/*            │  ← File I/O for projects
└─────────────────────────────────┘
        │
        ├── yosys (pre-installed in image)
        ├── iverilog + vvp (pre-installed)
        └── /pdk/sky130 (mounted read-only volume)
```

The browser never touches the filesystem directly — everything goes through the
Express API. The `src/lib/httpApi.js` module provides a `window.api` shim that
makes all React components work identically in Docker or Electron mode.

---

## Troubleshooting

**Container exits immediately**
```bash
docker logs verilogblocks
# Usually a missing volume mount or port conflict
```

**"PDK not found" after clicking Validate**
```bash
# Check the volume is mounted
docker exec verilogblocks ls /pdk/sky130/versions/

# Verify the env var
docker exec verilogblocks env | grep PDK
```

**Yosys synthesis button does nothing**
```bash
# Check yosys is working
docker exec verilogblocks yosys --version

# Check server logs
docker compose logs -f
```

**Port 3000 already in use**
```bash
# Use a different port
docker run -p 8080:3000 verilogblocks
# Then open http://localhost:8080
```

**Projects not persisting after restart**
- Make sure the volume mount is correct in your `docker run` or `docker-compose.yml`
- Projects are stored in `/app/projects` inside the container

---

## Image Details

| Layer | Package | Version |
|-------|---------|---------|
| OS | Ubuntu 22.04 | LTS |
| Runtime | Node.js | 20.x LTS |
| Synthesis | Yosys | 0.27+ (apt) |
| Simulation | Icarus Verilog | 11.x (apt) |
| Frontend | React + Vite | 18 + 5 |
| Canvas | ReactFlow | 11 |

**Image size:** ~650MB (Ubuntu + EDA tools + Node)
**Build time:** ~3–5 minutes (first build, cached thereafter)
