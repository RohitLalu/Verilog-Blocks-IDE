# Verilog Blocks IDE

A visual design environment for block-based digital logic development, PDK-aware cell selection, hierarchy management, synthesis, simulation, and analysis workflows.

This repository currently contains the active application under `verilog-ide/`. Older experiments and iterations are kept in `prev_iter/` for reference and are not the primary active project.

## Current project status

The active project includes:
- React + Vite frontend
- Express backend API
- Electron desktop support
- Docker-ready runtime configuration
- PDK registry and SkyWater SKY130 integration
- Yosys synthesis and Icarus Verilog simulation support
- STA, ATPG, testbench, and tutorial workflows
- Project browser, hierarchy export, and reusable custom blocks

## Repository structure

```text
.
├── README.md
├── LICENSE
├── prev_iter/            # older prototype iterations
└── verilog-ide/          # active application
    ├── package.json
    ├── package-lock.json
    ├── Dockerfile
    ├── docker-compose.yml
    ├── vite.config.js
    ├── electron-main.js
    ├── preload.js
    ├── index.html
    ├── public/
    ├── pdk/
    ├── server/
    ├── src/
    ├── docker-projects/
    ├── docker-synthesis/
    ├── docker-userblocks/
    ├── README-docker.md
    ├── open.zsh
    ├── close.zsh
    └── rebuild.zsh
```

## Features in the current build

- Drag-and-drop block-based circuit design in a flow canvas
- PDK-aware cell catalog and SkyWater SKY130 support
- Project creation, loading, and persistence
- Custom block creation and export as reusable user blocks
- Hierarchy export for modular designs
- Verilog generation from the block graph
- Yosys-based synthesis workflow
- Icarus Verilog testbench simulation and result handling
- STA panel for static timing analysis
- ATPG panel for test-generation related analysis
- Tutorial panel for guided onboarding
- Browser and Electron-based execution modes
- Docker deployment for containerized usage

## Requirements

### Local development
- Node.js 20.x or newer
- npm
- Optional: Electron runtime for desktop mode

### Hardware/EDA integration
- SkyWater SKY130 PDK installation for PDK validation and design workflows
- Docker and Docker Compose for container-based runs

## Quick start

From the repository root:

```bash
cd verilog-ide
npm install
```

### Run the frontend in development mode

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

### Run the backend API

In a second terminal:

```bash
npm run server
```

Backend runs at:

```text
http://localhost:3000
```

### Run the desktop app

```bash
npm run electron
```

### Build for production

```bash
npm run build
```

### Docker workflow

```bash
docker compose up -d
```

The project includes a Docker setup with persistent folders for projects, synthesis output, and user blocks. More details are in `verilog-ide/README-docker.md`.

### Security notes

The backend can read and write files, so it is locked down by default:

- It listens on `127.0.0.1` only (`VBIDE_HOST` to change). The Docker image binds all interfaces *inside* the container, and `docker-compose.yml` publishes the port on loopback only.
- It answers only requests whose `Host` is `localhost`, `127.0.0.1` or `[::1]` (plus `VBIDE_ALLOWED_HOSTS`), and only the page it serves. CORS is not enabled. In development, Vite proxies `/api` to it and its origin (`http://localhost:5173`) is allowed outside production; add others with `VBIDE_ALLOWED_ORIGINS`.
- Project and block names must be a single path segment: letters, digits, spaces, `_ - . ( )`, at most 100 characters.
- `/api/pdk/read-lib` serves only `.lib` files that sit inside a configured PDK folder.
- Never expose the API to an untrusted network: there is no login. Use a reverse proxy with authentication for shared servers.

## Main backend routes

The backend exposes the core API endpoints used by the IDE, including:

- `GET /api/pdk/list`
- `GET /api/pdk/cells-manifest/:id`
- `POST /api/pdk/validate-path`
- `POST /api/pdk/read-lib`
- `GET /api/prefs`
- `POST /api/prefs`
- `GET /api/project/list`
- `POST /api/project/save`
- `GET /api/project/load/:name`
- `POST /api/project/export-as-block`
- `GET /api/project/user-blocks`
- `POST /api/yosys/synth`
- `POST /api/sim/run`

## Usage workflow

1. Open the app in the browser or desktop shell.
2. Select a PDK and validate the local PDK root path.
3. Create or load a project.
4. Drag blocks to the canvas and connect signals.
5. Generate Verilog from the design graph.
6. Run synthesis or simulation.
7. Review STA/ATPG outputs and export reusable blocks as needed.

## Notes

- The active implementation is in `verilog-ide/`.
- `prev_iter/` contains earlier design iterations and is kept for historical reference.
- The project is designed around a modern web frontend with support for desktop and containerized execution.

## License

This project is licensed under the terms in `LICENSE`.
