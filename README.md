# VerilogBlocks IDE (VBiDE)

A free desktop app for learning digital and ASIC design. Drag real SkyWater SKY130 (or GF180MCU) standard cells onto a
canvas and wire them up. The app writes the Verilog, simulates it with Icarus Verilog, synthesises it with Yosys, and
reports static timing and stuck-at fault coverage (ATPG), checks properties formally with SymbiYosys, and runs cocotb and
pyuvm (UVM in Python) testbenches. Yosys, Icarus Verilog, SymbiYosys, and Python with cocotb and pyuvm come with the app
(on Windows, cocotb and pyuvm are not included; see *Bundled tools*).

* **Website:** https://rohitlalu.github.io/Verilog-Blocks-IDE/ (a one-minute video, screenshots, downloads)
* **Download:** the [latest release](https://github.com/RohitLalu/Verilog-Blocks-IDE/releases/latest) for macOS
  (Apple silicon), Windows 10/11 (64-bit) and Linux (x86-64 AppImage)
* **Licence:** MIT

## Install

| System | File | First launch |
|--------|------|--------------|
| macOS (M1 or newer) | `VerilogBlocks-IDE-mac-arm64.dmg` | Drag the app to Applications. The app is not signed yet, so macOS may call it "damaged": run `xattr -dr com.apple.quarantine "/Applications/VerilogBlocks IDE.app"` once. |
| Windows 10/11 | `VerilogBlocks-IDE-Setup-x64.exe` (or the portable `-win-x64.zip`) | SmartScreen may say "Windows protected your PC": click **More info**, then **Run anyway**. |
| Linux x86-64 | `VerilogBlocks-IDE-linux-x86_64.AppImage` | `chmod +x VerilogBlocks-IDE-linux-x86_64.AppImage`, then run it. |

Fault coverage (ATPG) also needs [atalanta](https://github.com/hsluoyz/Atalanta). It is not bundled because its licence
allows teaching and research use only, but you can build it yourself in a few minutes:
**[docs/ATALANTA.md](docs/ATALANTA.md)** (macOS, Windows, Linux; licence terms included). The app's **⚙ Tools** window
(bottom of the cell list) shows which tools it found, their versions and locations, and the build steps for your system. Synthesis onto real cells needs the PDK's Liberty file:
point the app at your SKY130 or GF180 PDK folder when it asks.

## What you can do

1. **Start a project** on a process (SkyWater SKY130 or GlobalFoundries GF180MCU).
2. **Draw** by dragging standard cells onto the canvas and wiring output pins to input pins. Wires are named after
   their driver; mismatched widths and second drivers are refused. Undo, redo, copy and paste work.
3. **Read the Verilog**: structural Verilog updates as you draw. Unconnected pins become the module's ports.
4. **Simulate** with Icarus Verilog: pick a constant, clock, sequence or random stimulus per input. All inputs run in
   parallel, and the waveform opens showing the whole run.
5. **Synthesise** with Yosys onto the PDK's real cells (cell list and chip area).
6. **Check timing** (critical path, slack, maximum frequency, shown on the canvas) and **fault coverage** (ATPG).
7. **Prove it** (**⊨ Formal**): write `assert`/`assume` properties; SymbiYosys proves them for every input, or shows a
   counterexample in the waveform viewer.
8. **Test it in Python**: the testbench's **cocotb** tab writes a cocotb test, or a UVM-structured **pyuvm** one, and runs it.
9. **Reuse**: save a design as a block and place it inside bigger designs (hierarchy).
10. **Ask the tutor** (**✦ Ask**, or **✦ Explain** next to any result): VerilogBlocks' own assistant explains your
   circuit, your simulation, timing, ATPG and Yosys results, and any cell. It runs locally (see below).

### The learning assistant

The assistant is **vbide-tutor**, a small open-source model made for this app. It runs on your own computer through
[Ollama](https://ollama.com), so nothing you type leaves the machine.

1. Install Ollama (free; macOS, Windows, Linux) and start it.
2. In VerilogBlocks IDE click **✦ Ask**, then **Set up the tutor**. The app downloads the base model, Qwen2.5-Coder 1.5B
   (Apache-2.0, about 1 GB), once, and builds `vbide-tutor` from it in your Ollama, with instructions about this app and
   settings for steady explanations. No training is involved; you can see it with `ollama show vbide-tutor:2.1`.
3. Ask away. Each question goes with your design (cells, Verilog) and your latest simulation, timing, ATPG and Yosys
   results, so you can ask "why is this my critical path?" or press **✦ Explain** next to a result.

The chat floats over the canvas and stays open beside any panel. A small local model can be wrong; check important
answers.

Everything runs on your computer. Projects are ordinary files in your user folder (see *Where your data lives*).

## Roadmap

**v2.0.2 (released)**

* Rename the inputs and outputs of individual blocks: double-click a pin label. The name becomes the module's port
  (or the wire an output drives); two unconnected inputs may share a name to become one shared port.
* **✦ Ask**, a learning assistant: ask about your circuit, Verilog or the EDA steps. It runs a small open-source model
  (Qwen2.5-Coder 1.5B, about 1 GB) on your own computer through [Ollama](https://ollama.com), installed separately;
  nothing you type leaves the machine. A built-in runtime may follow once the feature has proved useful.
* Designs built from saved designs (hierarchy) now generate valid Verilog, and the waveform shows your signal names.

**v2.0.3 (released)**

* Supported Electron (45) and patched dependencies (see *Security notes*).

**v2.0.4 (released)**

* **⚙ Tools** window: which tools the app uses (bundled or installed), their versions and locations; atalanta build
  guide ([docs/ATALANTA.md](docs/ATALANTA.md)) linked from it and from the ATPG panel.

**v2.1.0**

* The assistant becomes **vbide-tutor**, built for this app, and is fully part of the IDE: it sees your design and your
  latest simulation, timing, ATPG, Yosys and cocotb results and how far along the flow you are; **✦ Explain** buttons next
  to each result and on every cell's help; the chat floats over the canvas beside any panel. It suggests the next flow
  step, compares designs, and introduces design-for-test and UVM-style verification once testing starts.
* Tool panels open as **tabs** in a resizable right frame (like Vivado).
* Wires: a visible **×** deletes a selected wire, double-click deletes too; **combinational loops** are refused.
* ATPG: a **Vectors** tab shows every test pattern without downloading; the pattern file is now found even when the
  folder path contains a dot.
* **cocotb** tests (Python) from the testbench panel, run with the bundled Icarus Verilog, with a **UVM (pyuvm)** template.
* **⊨ Formal** panel: SymbiYosys proves `assert` properties (or checks them to a depth); counterexamples open as waveforms.
* Bundled with the app: Python 3.11 with cocotb and pyuvm (macOS, Linux), SymbiYosys with the yices solver (all).
* Content-Security-Policy on the app's pages.
* The Delete key works on a Mac keyboard; a panel error no longer blanks the window.

**Next**

* Promo video: soft background music, a Yosys synthesis run, and a bigger module built from smaller custom modules.

**Later**

* The complete [LibreLane](https://github.com/librelane/librelane) RTL-to-GDS flow, driven from the GUI.
* A fine-tuned vbide-tutor (LoRA on a curated set of questions and answers about this app and digital design),
  published as an Ollama model.
* An agentic assistant for chip design that proposes and carries out design decisions once the requirements are
  clearly understood.
* A GDS layout viewer, in the spirit of the [Tiny Tapeout GDS viewer](https://gds-viewer.tinytapeout.com).

## Repository structure

```text
.
├── README.md
├── LICENSE
├── netlify.toml            # website deploy: publishes website/site, no build step
├── .github/workflows/      # desktop.yml: build + test + package on macOS, Linux, Windows; releases on v* tags
├── docs/ATALANTA.md         # how users build atalanta for ATPG (licence terms included)
├── website/
│   ├── site/               # the static website (index.html, screenshots, promo video)
│   ├── capture/            # capture.js: screenshots of the real app
│   └── video/              # record.js: records the promo video from the real app
├── prev_iter/              # older prototypes, reference only (not built; their package files were removed so
│                           #   Dependabot stops flagging them; restore from git history to run one)
└── verilog-ide/            # the application
    ├── src/                # React UI (canvas, panels, Verilog/testbench generation, VCD viewer)
    ├── server/             # tool runners shared by the desktop app and the Docker server
    ├── electron-main.js, preload.js
    ├── scripts/fetch-tools.js, tools/tools.lock.json   # bundled Yosys / Icarus Verilog
    ├── pdk/                # PDK registry and cell manifests
    ├── test/               # node --test suite
    ├── Dockerfile, docker-compose.yml, README-docker.md
    └── package.json
```

## Development

### Requirements

#### Local development
- Node.js 20.x or newer
- npm
- Optional: Electron runtime for desktop mode

#### Hardware/EDA integration
- SkyWater SKY130 PDK installation for PDK validation and design workflows
- Docker and Docker Compose for container-based runs

### Quick start

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
Always create a release by pushing the tag as above. A release (or tag) made on GitHub's *Draft a new release* page
does not start the workflow, so it stays empty, and if it is published it becomes "latest" and the website's download
buttons break. If that happens, delete that release and its tag, then push the tag from your clone.

The website's download buttons link to `releases/latest/download/<file>`, so publishing a release updates them; the
installer names carry no version number for that reason.
Public installers never include atalanta (see below).

Until the apps are code-signed, users see a warning the first time they open them:

* **macOS** may call the app "damaged". Remove the download quarantine once with
  `xattr -dr com.apple.quarantine "/Applications/VerilogBlocks IDE.app"`.
* **Windows** SmartScreen says "Windows protected your PC": click *More info*, then *Run anyway*.
* **Linux**: `chmod +x VerilogBlocks*.AppImage`, then run it.

#### Bundled tools

`npm run fetch-tools` (`scripts/fetch-tools.js`) downloads the OSS CAD Suite release pinned in `tools/tools.lock.json`
(size and SHA-256 checked) and keeps only what the app runs, with the shared libraries they actually load and their
licences. On Linux it asks the suite's own loader; on macOS it walks `otool -L` (following `@rpath`); on Windows it reads
the DLL import tables. It then runs the result with a scrubbed environment: compile and simulate, synthesise through ABC,
prove a property with SymbiYosys, and (macOS, Linux) pass a cocotb test that imports pyuvm.

| Part | macOS | Linux | Windows |
|------|:-----:|:-----:|:-------:|
| Yosys, yosys-abc, Icarus Verilog (iverilog, vvp) | ✓ | ✓ | ✓ |
| SymbiYosys (`sby`) with the yices solver | ✓ | ✓ | ✓ |
| Python 3.11 (standard library, trimmed) | ✓ | ✓ | ✓ (runs SymbiYosys) |
| cocotb | ✓ | ✓ | – |
| pyuvm (from PyPI, pinned) | ✓ | ✓ | – |

Windows: OSS CAD Suite's Windows Python is a MinGW build without cocotb, and cocotb's own Windows packages target the
standard (MSVC) Python, so the app can't ship a working cocotb there yet. Windows users install Python and
`python -m pip install cocotb pyuvm` themselves; whether cocotb then works with the bundled Icarus on Windows is not yet
verified. Sizes: about 125 MB on macOS, more on Linux and Windows. The archive is cached in `.cache/tools/`, and
neither folder is committed. The only change to upstream files: the `sby` and `yosys-smtbmc` launcher scripts get quotes
around one path, so they work from a folder with a space.

* `--with-atalanta` (or `VBIDE_BUNDLE_ATALANTA=1`) also compiles atalanta from the pinned commit. **Off by default**:
  atalanta's README allows teaching and research use only, and no commercial product without permission from its
  author, so shipping it in public installers needs that decision first. Users build it themselves instead, following
  [docs/ATALANTA.md](docs/ATALANTA.md); the app also looks in `~/.local/bin` (macOS, Linux), where that guide puts it.
* `THIRD_PARTY_NOTICES.txt` (generated next to the tools) has the licences and source pointers.
  Yosys is ISC. Icarus Verilog is GPL-2.0, run as a separate program. Have the redistribution terms reviewed before
  publishing installers.
* iverilog cannot handle a space in its own install path (it builds shell command lines unquoted). Installed apps
  usually have one (`/Applications/VerilogBlocks IDE.app`). On macOS and Linux the app passes iverilog a space-free
  alias (a symlink in a private temp folder); on Windows a directory junction, because 8.3 short names can be switched
  off. Each Windows DLL sits next to the programs that load it, so another MinGW runtime on `PATH` can't be picked up.

Not done yet: code signing and notarization (macOS, Windows), auto-update, an app icon, and bundled fonts. The UI loads
two Google Fonts and falls back to system fonts when offline.

### Build for production

```bash
npm run build
```

### Website and video

The site in `website/site/` is plain HTML (no build). Netlify publishes it from `main` using `netlify.toml`.
Its screenshots and the promo video are recorded from the real app:

```bash
cd verilog-ide && npm run build
npx electron ../website/capture/capture.js    # screenshots -> website/site/assets/shots/
npx electron ../website/video/record.js       # video -> website/site/assets/vbide-promo.mp4 (+ poster); needs ffmpeg
```

Both open the app in a window and drive it; leave the window visible while they run. Put `atalanta` on `PATH` first
so the ATPG step has results.

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
- The cocotb and formal routes run the user's own Python test and SymbiYosys job, with the server's user rights. Another
  reason never to expose the API to others.
- The built app's pages carry a Content-Security-Policy: scripts only from the app, network only to the app itself and
  the local Ollama (the assistant); no plugins, frames or form posts.
- Never expose the API to an untrusted network: there is no login. Use a reverse proxy with authentication for shared servers.
- Dependencies: `npm audit --omit=dev` (what the app and the Docker server ship) reports no known vulnerabilities. The
  desktop app runs a supported Electron (45), with a sandboxed renderer that only loads the app's own pages.
  `npm audit` still lists 6 moderate findings in electron-builder's packaging tools (an old `minimatch` in its glob
  handling). They run only at build time, on patterns from this repository; the suggested fix is a downgrade, so they
  are accepted until electron-builder updates. Check again with `npm audit` before each release.

### Main backend routes

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
- `POST /api/atpg/run`
- `GET /api/atpg/download/bench`
- `GET /api/health`

## License

This project is licensed under the terms in `LICENSE`.
