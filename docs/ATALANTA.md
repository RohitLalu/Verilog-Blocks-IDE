# Building atalanta for fault coverage (ATPG)

VerilogBlocks IDE uses **atalanta** to generate stuck-at test patterns and report fault coverage (the **◈ ATPG**
panel). Everything else (Yosys, Icarus Verilog) comes with the app, but atalanta does not: its licence does not allow
us to ship it to everyone. You can build it yourself on your own computer in a few minutes.

## Licence: read this first

atalanta was developed at the Bradley Department of Electrical and Computer Engineering, Virginia Tech, and the
copyright belongs to Virginia Tech. From its README:

> The source code is released for teaching and research use only. Any publication in which ATALANTA was used to obtain
> the results should cite the reference given below. (Please do not say that a public domain tool was used in this
> research.)
>
> This program, or any derivative thereof, may not be reproduced nor used for any commercial product without a written
> permission form from Prof. Dong S. Ha.

What that means for you:

* **Students, teachers and researchers** may build and use it, as below.
* **Commercial use** (a company product or service) needs written permission from Prof. Dong S. Ha, Department of
  Electrical and Computer Engineering, Virginia Tech, Blacksburg, VA 24061, ha@vt.edu.
* **Publications** with results from atalanta must cite: H. K. Lee and D. S. Ha, "On the Generation of Test Patterns
  for Combinational Circuits," Technical Report No. 12_93, Dept. of Electrical Engineering, Virginia Polytechnic
  Institute and State University.
* **Don't pass on the program you build**: building it for yourself is fine, but handing out copies of the binary is
  reproducing it. That is also why VerilogBlocks IDE's installers don't include it.

This is a summary, not legal advice; the README in atalanta's source is what counts.

## What you build

The source is [hsluoyz/Atalanta](https://github.com/hsluoyz/Atalanta) (atalanta 2.0). The commands below use the same
fixed version (commit `a8e07fe4af80c55b0d4ca77e382731b03ad731dc`) and the same compiler options that VerilogBlocks IDE's
own tests use on macOS, Linux and Windows, so you get the version the app was tested with.

It is about 20 C++ files and needs only a C++ compiler and git. No `make` is needed.

## macOS

In the **Terminal** app:

```bash
xcode-select --install          # once: installs Apple's free compiler and git (skip if already installed)

git init atalanta && cd atalanta
git fetch --depth 1 https://github.com/hsluoyz/Atalanta a8e07fe4af80c55b0d4ca77e382731b03ad731dc
git checkout FETCH_HEAD

c++ -O2 -std=gnu++14 -w error.cpp hash.cpp help.cpp read_cct.cpp structure.cpp io.cpp pio.cpp stem.cpp \
  define_fault_list.cpp testability.cpp fan.cpp learn.cpp ppsfp.cpp truth.cpp lsim.cpp fsim.cpp random.cpp \
  print.cpp sim.cpp atalanta.cpp -o atalanta

mkdir -p ~/.local/bin && mv atalanta ~/.local/bin/
```

`-std=gnu++14` matters: newer compilers reject the old code's `register` keyword otherwise. The app looks in
`~/.local/bin` by itself, even when you open it from Finder, so no admin rights or PATH changes are needed.

## Linux

```bash
sudo apt install g++ git        # Debian/Ubuntu; on Fedora: sudo dnf install gcc-c++ git

git init atalanta && cd atalanta
git fetch --depth 1 https://github.com/hsluoyz/Atalanta a8e07fe4af80c55b0d4ca77e382731b03ad731dc
git checkout FETCH_HEAD

g++ -O2 -std=gnu++14 -w -static error.cpp hash.cpp help.cpp read_cct.cpp structure.cpp io.cpp pio.cpp stem.cpp \
  define_fault_list.cpp testability.cpp fan.cpp learn.cpp ppsfp.cpp truth.cpp lsim.cpp fsim.cpp random.cpp \
  print.cpp sim.cpp atalanta.cpp -o atalanta

mkdir -p ~/.local/bin && mv atalanta ~/.local/bin/
```

If `-static` fails (some distributions don't ship static C++ libraries), leave it out. The app also looks in
`~/.local/bin` by itself.

## Windows

Windows has no C++ compiler built in. The simplest free one is MSYS2's GCC:

1. Install MSYS2 from [msys2.org](https://www.msys2.org) (or `winget install MSYS2.MSYS2` in PowerShell).
2. Open **MSYS2 UCRT64** from the Start menu and run:

   ```bash
   pacman -S --needed git mingw-w64-ucrt-x86_64-gcc

   git init atalanta && cd atalanta
   git fetch --depth 1 https://github.com/hsluoyz/Atalanta a8e07fe4af80c55b0d4ca77e382731b03ad731dc
   git checkout FETCH_HEAD

   # one line differs on 64-bit Windows (long is 32-bit there); this makes it compile
   sed -i 's/time((long\*)NULL)/time(NULL)/' random.cpp

   g++ -O2 -std=gnu++14 -w -static -DWIN32 error.cpp hash.cpp help.cpp read_cct.cpp structure.cpp io.cpp pio.cpp \
     stem.cpp define_fault_list.cpp testability.cpp fan.cpp learn.cpp ppsfp.cpp truth.cpp lsim.cpp fsim.cpp \
     random.cpp print.cpp sim.cpp atalanta.cpp -o atalanta.exe -lpsapi -Wl,--stack,16777216

   mkdir -p "$LOCALAPPDATA/Programs/atalanta" && mv atalanta.exe "$LOCALAPPDATA/Programs/atalanta/"
   ```

   `-Wl,--stack,16777216` gives atalanta a 16 MB stack; with Windows' default 1 MB it crashes on larger circuits.
   `-static` makes `atalanta.exe` run outside MSYS2.
3. Add that folder to your PATH. In PowerShell (not MSYS2):

   ```powershell
   $dir = "$env:LOCALAPPDATA\Programs\atalanta"
   [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ";$dir", 'User')
   ```

   Or: Start → "Edit environment variables for your account" → **Path** → **New** → that folder.

## Check it

Restart VerilogBlocks IDE, then open **⚙ Tools** (bottom of the cell list): atalanta should say *installed on this
computer*. Run **◈ ATPG** on any design to get its fault coverage.

From a terminal you can also run a two-gate test. atalanta skips the first line of a `.bench` file, so it starts with a
comment:

```bash
printf '# test\nINPUT(a)\nINPUT(b)\nOUTPUT(y)\ny = AND(a, b)\n' > t.bench
atalanta t.bench | grep "Fault coverage"      # Fault coverage : 100.000 %
```

(Use `~/.local/bin/atalanta` if `atalanta` is not found in your terminal; on Windows, open a new terminal after
changing PATH.)

## Docker version

The Docker image builds atalanta itself while the image is built, on your machine, for your own use. Nothing extra is
needed there.
