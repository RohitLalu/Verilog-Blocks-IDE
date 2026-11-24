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
npm run start          # development: Vite dev server + Electron (hot reload)
npm run electron:dist  # builds the UI, then runs Electron on the built files
npm run smoke          # headless self-check: page renders, IPC works, saves round-trip, unsafe input refused
```

The desktop app uses the same Yosys / iverilog / atalanta runners as the Docker server.
A **packaged** app brings its own Yosys and Icarus Verilog (see *Bundled tools* below) and uses them first.
During development (`npm run start`) the tools come from your `PATH`; on macOS the usual Homebrew locations
(`/opt/homebrew/bin`, `/usr/local/bin`) are added automatically, because apps started from Finder get a minimal `PATH`.

**Where your data lives**

| Build | Projects, outputs, preferences |
|-------|--------------------------------|
| Packaged app | The per-user data folder (macOS `~/Library/Application Support/VerilogBlocks IDE`, Linux `~/.config/VerilogBlocks IDE`, Windows `%APPDATA%\VerilogBlocks IDE`) |
| `npm run start` / `electron:dist` | Inside the source tree (`projects/`, `synthesis/`, `atpg/`), so existing local projects stay visible |
| Anything | Set `VBIDE_DATA_DIR=/some/folder` to override both |

### Package the desktop app

```bash
npm run fetch-tools   # once per machine: bundle Yosys + Icarus Verilog for this OS into resources/tools/<os>-<arch>/
npm run pack          # unpacked app in release/ (fast; what CI tests)
npm run dist          # installers for this OS: .dmg + .zip (macOS arm64), .AppImage (Linux x64), NSIS .exe + .zip (Windows x64)
```

Each installer is built on its own OS (electron-builder and the tool bundling both need it).
`.github/workflows/desktop.yml` does this for macOS arm64, Linux x64 and Windows x64 on every push.

Run the packaged binary with `--smoke-test` before releasing (on a headless Linux box: `xvfb-run -a <binary> --smoke-test`).
It checks that the window renders from `file://`, that the preload bridge works, and that data goes to the writable data folder.
When tools are bundled, it also checks that yosys / iverilog / vvp resolve **inside** the app, that a simulation through IPC
returns a waveform, and that ATPG and a Yosys + ABC run succeed.

#### Publishing a release

Releases go to the repository's GitHub **Releases** page as a draft that you review before anyone sees it.

1. Set `"version"` in `verilog-ide/package.json` (for example `2.1.0`) and commit it.
2. Tag that commit and push the tag:

   ```bash
   git tag v2.1.0
   git push origin v2.1.0
   ```

3. `.github/workflows/desktop.yml` first runs the tests and the packaged-app smoke test on macOS, Linux and Windows.
   Only if all three pass does it create a draft release and attach the installers: `.dmg` + `.zip` (macOS arm64),
   `.AppImage` (Linux x64), and the NSIS `.exe` + `.zip` (Windows x64).
4. On GitHub, open **Releases**, check the draft and its files, then click **Publish release**.

The tag must match the version (`v` + `version`), or the release job stops.
Public installers never include atalanta (see below).

Until the apps are code-signed, users see a warning the first time they open them:

* **macOS** may call the app "damaged". Remove the download quarantine once with
  `xattr -dr com.apple.quarantine "/Applications/VerilogBlocks IDE.app"`.
* **Windows** SmartScreen says "Windows protected your PC": click *More info*, then *Run anyway*.
* **Linux**: `chmod +x VerilogBlocks*.AppImage`, then run it.

#### Bundled tools

`npm run fetch-tools` (`scripts/fetch-tools.js`) downloads the OSS CAD Suite release pinned in `tools/tools.lock.json`
(size and SHA-256 checked) and keeps only what the app runs: Yosys, yosys-abc, iverilog, vvp, their data files, their
licences, and the shared libraries they actually load. On Linux it asks the suite's own loader; on macOS it walks
`otool -L`; on Windows it reads the DLL import tables. It then runs the result with a scrubbed environment (compile and
simulate, synthesise through ABC). Sizes: about 60 MB on macOS and about 210 MB on Windows (MinGW builds are larger).
The archive is cached in `.cache/tools/`, and neither folder is committed.

* `--with-atalanta` (or `VBIDE_BUNDLE_ATALANTA=1`) also compiles atalanta from the pinned commit. **Off by default**:
  atalanta's README allows teaching and research use only, and no commercial product without permission from its
  author, so shipping it in public installers needs that decision first. Without it, ATPG in the desktop app needs
  `atalanta` on your `PATH`.
* `THIRD_PARTY_NOTICES.txt` (generated next to the tools) has the licences and source pointers.
  Yosys is ISC. Icarus Verilog is GPL-2.0, run as a separate program. Have the redistribution terms reviewed before
  publishing installers.
* iverilog cannot handle a space in its own install path (it builds shell command lines unquoted). Installed apps
  usually have one (`/Applications/VerilogBlocks IDE.app`). On macOS and Linux the app passes iverilog a space-free
  alias (a symlink in a private temp folder). On Windows iverilog uses the 8.3 short path itself.

Not done yet: code signing and notarization (macOS, Windows), auto-update, an app icon, and bundled fonts. The UI loads
two Google Fonts and falls back to system fonts when offline.

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
