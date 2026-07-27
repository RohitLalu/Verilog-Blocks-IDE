# Verilog Blocks IDE

A visual Verilog IDE for block-based design, PDK-native cell selection, hierarchy, synthesis, simulation, and timing analysis.

This repository contains the project under `iter1/verilog-ide-1`, which includes:
- React + Vite frontend
- Electron support
- Express backend API
- Docker + Docker Compose runtime
- PDK metadata for SkyWater SKY130
- Yosys synthesis and Icarus Verilog simulation integration

Video walkthrough:
https://drive.google.com/drive/folders/1T1VfGJWniyjddWyE6Sshy3YmdkX9heoD?usp=sharing

## Project structure

`iter1/verilog-ide-1/`
- `package.json` – npm scripts and dependencies
- `Dockerfile` – container build for production runtime
- `docker-compose.yml` – recommended Docker runtime setup
- `server/server.js` – Express backend and API routes
- `src/` – React UI and application logic
- `pdk/` – PDK registry and cell manifests
- `public/` – public assets served by the frontend
- `electron-main.js` / `preload.js` – Electron desktop support
- `README-docker.md` – Docker usage notes

## Features

- Drag-and-drop Verilog block design
- PDK-native cell selection for SkyWater SKY130
- Project save/load and block export
- Verilog generation from graph designs
- Yosys-based synthesis support
- Icarus Verilog testbench simulation
- Timing analysis and waveform visualization
- Docker-ready runtime with pre-installed EDA tools

## Requirements

### Local development
- Node.js 20.x or newer
- npm
- Optionally Electron for desktop mode

### Docker usage
- Docker Engine
- Docker Compose
- A local SkyWater SKY130 PDK install (or another supported PDK)

## Setup and usage

### 1. Open the main project folder

All commands should be executed from:

```bash
cd /Users/hello.welcometothisdevice/Verilog-Blocks-IDE/iter1/verilog-ide-1
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run dev
```

Then open the frontend in your browser at:

```bash
http://localhost:5173
```

### 4. Run the Express backend server

In a second terminal:

```bash
npm run server
```

This starts the backend at `http://localhost:3000`.

### 5. Run the full app with Electron

```bash
npm run electron
```

### 6. Build for production

```bash
npm run build
```

### 7. Run with Docker

Build and run the image:

```bash
npm run docker
```

Or use Docker Compose from `iter1/verilog-ide-1/`:

```bash
docker compose up -d
```

Then open:

```bash
http://localhost:3000
```

## Docker Compose details

The included `docker-compose.yml`:
- Builds the app image from `Dockerfile`
- Exposes port `3000`
- Mounts persistent host folders for projects, synthesis output, and user blocks
- Mounts the SkyWater SKY130 PDK from `${HOME}/.ciel/ciel/sky130` into `/pdk/sky130`
- Sets `SKY130_PDK_ROOT=/pdk/sky130/versions/...`

### Recommended Docker commands

```bash
docker compose up -d

docker compose logs -f
docker compose down
docker compose up -d --build
```

## PDK path and validation

When the app starts, the PDK selector reads `iter1/verilog-ide-1/pdk/pdk-registry.json` and shows known PDKs.

For Docker mode, the app uses container-internal paths such as:

```text
/pdk/sky130/versions/<hash>
```

If you use a different PDK location, update the volume mount and `SKY130_PDK_ROOT` environment variable in `docker-compose.yml`.

## Usage workflow

1. Open the IDE in the browser or Electron.
2. Select your PDK and validate the PDK root path.
3. Create a new project.
4. Drag blocks onto the canvas and connect signals.
5. Generate Verilog from the block graph.
6. Save the project to persist it in `/app/projects` or the Docker volume.
7. Run synthesis or simulation from the toolbar.
8. Export completed blocks as reusable user blocks.

## Important paths

| Purpose | Container path | Host path (Docker) |
|---|---|---|
| Projects | `/app/projects` | `./docker-projects` |
| Synthesis output | `/app/synthesis/output` | `./docker-synthesis` |
| User blocks | `/app/pdk/user-blocks` | `./docker-userblocks` |
| SkyWater PDK | `/pdk/sky130` | `${HOME}/.ciel/ciel/sky130` |

## API and backend routes

The backend exposes the following primary routes in `server/server.js`:

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

## Troubleshooting

- If the page does not load, verify the server is running and the port is correct.
- If PDK validation fails, confirm the host PDK folder is mounted into the container and that the path is correct.
- If projects are not saved, ensure Docker volumes are mounted and the app is saving into `/app/projects`.
- If synthesis or simulation fails, check the container logs and verify `yosys` / `iverilog` are installed.

## Notes

- The repository root contains the main README and the application source lives in `iter1/verilog-ide-1`.
- Docker mode uses a production build and bundled frontend assets in `/dist`.
- Development mode uses Vite hot reload at `http://localhost:5173`.

## Useful commands

```bash
# From iter1/verilog-ide-1
npm install
npm run dev
npm run server
npm run build
npm run electron
npm run docker
```

## License

This project is licensed under the terms included in `LICENSE`.

