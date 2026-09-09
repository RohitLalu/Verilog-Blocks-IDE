# VerilogBlocks IDE — Docker Setup

Run the full IDE in a container. **Yosys, Icarus Verilog, and GTKWave** are pre-installed.
Access via browser at **http://localhost:3000** — fully platform-independent, no X11 forwarding required.

---

## Quick Start

```bash
docker build -t verilogblocks .

docker run -d \
  --name verilogblocks \
  -p 3000:3000 \
  -e SKY130_PDK_ROOT=/pdk/sky130/versions/0fe599b2afb6708d281543108caf8310912f54af \
  -v "$HOME/.ciel/ciel/sky130:/pdk/sky130:ro" \
  -v "$PWD/docker-projects:/app/projects" \
  -v "$PWD/docker-synthesis:/app/synthesis/output" \
  verilogblocks

open http://localhost:3000
```

---

## Docker Compose (recommended)

```bash
docker compose up -d
docker compose logs -f
docker compose down
docker compose up -d --build
```

---

## What's new in this build

| Feature | Where |
|---|---|
| GTKWave + Yosys + Icarus Verilog, all pre-installed | Dockerfile |
| Web-based VCD viewer — GTKWave-style canvas rendering, zero X11 | 📊 VCD button in Simulator/Testbench panels |
| sky130 expanded to 45 cells | AOI/OAI gates, MAJ3, AND3/4, OR3/4, NAND3/4, NOR3/4, full DFF set, scan DFF, latch, drive variants |
| GF180MCU — 30 cells, new PDK | 3.3V/180nm, distinct port naming (Z/ZN, I0/I1, CI/CO, SE/SI) |
| Undo / Redo | Ctrl+Z / Ctrl+Y, or ↩ ↪ in toolbar |
| STA canvas highlighting | Run STA → nodes get coloured border + slack badge |
| Project Browser | 📂 Open Project in sidebar |

---

## Setting the PDK path

1. PDK Selector opens on first load
2. Pick SkyWater SKY130 or GF180MCU
3. Path is pre-filled from env var — click Validate
4. Create Project

Paths must be container-internal (`/pdk/...`).

---

## Persistent Data

| What | Container path | Host (compose) |
|------|---------------|---------------------------|
| Projects | `/app/projects` | `./docker-projects/` |
| Synthesis | `/app/synthesis/output` | `./docker-synthesis/` |
| Custom blocks | `/app/pdk/user-blocks` | `./docker-userblocks/` |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SKY130_PDK_ROOT` | sky130 PDK root inside container |
| `GF180_PDK_ROOT` | GF180MCU PDK root inside container |
| `PORT` | Server port (default 3000) |

### Adding GF180MCU

```bash
git clone https://github.com/google/gf180mcu-pdk ~/.volare/gf180mcuD
```
Uncomment in docker-compose.yml: `${HOME}/.volare/gf180mcuD:/pdk/gf180mcuD:ro`

---

## Waveform Viewing — Web VCD Viewer (no X11)

GTKWave's CLI binary is present for power users (`docker exec`), but the primary workflow is the built-in web viewer:

1. Run simulation
2. Click 📊 VCD in toolbar
3. Canvas waveform: click signals to add/remove, drag to pan, Ctrl+scroll to zoom

Optional native fallback:
```bash
docker exec -it verilogblocks gtkwave /app/projects/<name>/sim/wave.vcd
```
(requires X11 forwarding on host — not needed for normal use)

---

## Checking Tools

```bash
curl http://localhost:3000/api/health
docker exec -it verilogblocks bash
yosys --version; iverilog -V; gtkwave --version
```

---

## Development Mode

```bash
npm run dev      # Vite → :5173
npm run server   # Express API → :3000
```

---

## Architecture

```
Browser → Express server.js → yosys/iverilog/gtkwave + /pdk volumes
```

`src/lib/httpApi.js` provides a `window.api` shim so components work identically in Docker, Electron, or browser dev mode.

---

## Troubleshooting

- Container exits: `docker logs verilogblocks`
- PDK not found: `docker exec verilogblocks ls /pdk/sky130/versions/`
- Port conflict: `docker run -p 8080:3000 verilogblocks`

---

## Image Details

Ubuntu 22.04 · Node 20 LTS · Yosys · Icarus Verilog · GTKWave · React 18 + Vite 5 + ReactFlow 11

**Size:** ~700MB · **Build:** ~4-6 min first time
