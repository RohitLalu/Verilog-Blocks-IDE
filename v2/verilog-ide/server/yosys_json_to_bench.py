#!/usr/bin/env python3
"""
yosys_json_to_bench.py — Yosys JSON netlist → ISCAS89 .bench for atalanta.

Key facts about atalanta:
  - Combinational circuits ONLY. DFFs cause a hard abort.
  - Supported gates: AND, NAND, OR, NOR, XOR, XNOR, NOT, BUFF
  - INPUT/OUTPUT declarations required for every PI/PO

Strategy for sequential circuits (DFF handling):
  Atalanta's stuck-at ATPG targets the combinational logic cloud between
  flip-flops. We expose it by unfolding each DFF into:
    - Q  → new PRIMARY INPUT  (models the stored state, uncontrollable externally)
    - D  → new PRIMARY OUTPUT (models observability of the next-state logic)
  CLK and RST ports of DFFs are removed from the primary input list if they
  only fan into DFFs (not into combinational logic).

  This is called the "pseudo-PI/PO" or "scan-free combinational ATPG" model
  and is the standard approach when scan insertion hasn't been performed.

Usage:
  python3 yosys_json_to_bench.py <in.json> <out.bench>

Returns exit code 0 on success, 1 on error.
Prints a one-line summary to stdout; warnings go to stderr.
"""

import json
import re
import sys
from collections import defaultdict

# Yosys internal cell type  →  ISCAS89 gate keyword
GATE_MAP = {
    '$_AND_':   'AND',
    '$_NAND_':  'NAND',
    '$_OR_':    'OR',
    '$_NOR_':   'NOR',
    '$_XOR_':   'XOR',
    '$_XNOR_':  'XNOR',
    '$_NOT_':   'NOT',
    '$_BUF_':   'BUFF',
    # ANDNOT/ORNOT: atalanta doesn't have these — expand inline
    '$_ANDNOT_': None,
    '$_ORNOT_':  None,
    # MUX: expand to AND/OR/NOT tree
    '$_MUX_':   None,
    # DFF variants — all handled by the pseudo-PI/PO strategy
    '$_DFF_P_':   '__DFF__',
    '$_DFF_N_':   '__DFF__',
    '$_DFF_PP0_': '__DFF__',
    '$_DFF_PP1_': '__DFF__',
    '$_DFF_PN0_': '__DFF__',
    '$_DFF_PN1_': '__DFF__',
    '$_DFF_NP0_': '__DFF__',
    '$_DFF_NP1_': '__DFF__',
    '$_DFF_NN0_': '__DFF__',
    '$_DFF_NN1_': '__DFF__',
    '$_DFFE_PP_': '__DFF__',
    '$_DFFE_PN_': '__DFF__',
    '$_DFFE_NP_': '__DFF__',
    '$_DFFE_NN_': '__DFF__',
    '$_SDFF_PP0_': '__DFF__',
    '$_SDFF_PP1_': '__DFF__',
    '$_SDFF_PN0_': '__DFF__',
    '$_SDFF_PN1_': '__DFF__',
    '$_SDFFE_PP0P_': '__DFF__',
    '$_SDFFE_PP0N_': '__DFF__',
    '$_SDFFE_PP1P_': '__DFF__',
    '$_SDFFE_PP1N_': '__DFF__',
    '$_DLATCH_P_': '__DFF__',
    '$_DLATCH_N_': '__DFF__',
}

DFF_CLK_PORTS  = {'C', 'CLK', 'CLKN', 'G', 'E'}   # clock/enable — strip from PIs
DFF_RESET_PORTS = {'R', 'S', 'RST', 'SET', 'RN', 'SN'}  # reset/set — strip from PIs
DFF_DATA_PORT   = 'D'
DFF_Q_PORT      = 'Q'


def sanitize(name: str) -> str:
    """Signal names: letters, digits, underscore only. Leading digit → prefix n_."""
    s = re.sub(r'[^a-zA-Z0-9_]', '_', str(name))
    if s and s[0].isdigit():
        s = 'n_' + s
    return s or 'unnamed'


def bit_label(net_info: dict, idx: int, fallback_name: str) -> str:
    """Generate a signal name for bit [idx] of a named net."""
    bits = net_info.get('bits', [])
    name = net_info.get('name', fallback_name) or fallback_name
    if len(bits) == 1:
        return sanitize(name)
    return sanitize(f'{name}_{idx}')


def convert(json_path: str, bench_path: str) -> None:
    with open(json_path) as f:
        netlist = json.load(f)

    modules = netlist.get('modules', {})
    if not modules:
        sys.exit('ERROR: no modules in JSON')

    mod_name = next(iter(modules))
    mod      = modules[mod_name]

    ports    = mod.get('ports',    {})
    cells    = mod.get('cells',    {})
    netnames = mod.get('netnames', {})

    # ── Build bit → signal-name map ───────────────────────────────────────────
    bit_to_name: dict[int, str] = {}
    for net_name, net_info in netnames.items():
        for idx, bit in enumerate(net_info.get('bits', [])):
            if isinstance(bit, int):
                bit_to_name.setdefault(bit, sanitize(
                    net_name if len(net_info['bits']) == 1 else f'{net_name}_{idx}'
                ))

    def sig(bit) -> str | None:
        """Return signal name for a bit, or None for constants."""
        if bit in (0, 1, '0', '1', 'x', 'z'):
            return None
        return bit_to_name.get(bit, f'net_{bit}')

    # ── Primary inputs / outputs from module port declarations ────────────────
    declared_inputs:  set[str] = set()
    declared_outputs: set[str] = set()

    for port_name, port_info in ports.items():
        direction = port_info.get('direction', '')
        for idx, bit in enumerate(port_info.get('bits', [])):
            if not isinstance(bit, int):
                continue
            sname = bit_to_name.get(bit, sanitize(
                port_name if len(port_info['bits']) == 1 else f'{port_name}_{idx}'
            ))
            if direction == 'input':
                declared_inputs.add(sname)
            elif direction == 'output':
                declared_outputs.add(sname)

    # ── Classify cells — separate DFFs from combinational ─────────────────────
    dff_cells   = {}   # cell_name → cell_info
    comb_cells  = {}   # cell_name → cell_info
    unknown_cells = {} # fallback to BUFF

    for cell_name, cell_info in cells.items():
        ctype = cell_info.get('type', '')
        mapped = GATE_MAP.get(ctype)
        if mapped == '__DFF__':
            dff_cells[cell_name] = cell_info
        elif mapped is not None or ctype in ('$_MUX_', '$_ANDNOT_', '$_ORNOT_'):
            comb_cells[cell_name] = cell_info
        else:
            unknown_cells[cell_name] = cell_info

    if unknown_cells:
        print(f'WARNING: {len(unknown_cells)} unknown cell types treated as BUFF: '
              + ', '.join(c["type"] for c in list(unknown_cells.values())[:4]),
              file=sys.stderr)

    # ── DFF pseudo-PI/PO unfolding ────────────────────────────────────────────
    # Bits that are clock/reset inputs to DFFs only — remove from primary inputs.
    dff_clk_bits:   set[int] = set()
    dff_reset_bits: set[int] = set()
    dff_q_names:    set[str] = set()   # Q outputs become new PIs
    dff_d_names:    set[str] = set()   # D inputs  become new POs

    for cell_info in dff_cells.values():
        conns = cell_info.get('connections', {})
        dirs  = cell_info.get('port_directions', {})
        for port, bits in conns.items():
            for bit in bits:
                if not isinstance(bit, int):
                    continue
                if port in DFF_CLK_PORTS:
                    dff_clk_bits.add(bit)
                elif port in DFF_RESET_PORTS:
                    dff_reset_bits.add(bit)
                elif port == DFF_Q_PORT:
                    s = sig(bit)
                    if s:
                        dff_q_names.add(s)
                elif port == DFF_DATA_PORT:
                    s = sig(bit)
                    if s:
                        dff_d_names.add(s)

    # Remove CLK/RST from declared inputs only if they are DFF-exclusive
    # (a CLK that also fans into combinational logic stays as a PI)
    comb_input_bits: set[int] = set()
    for cell_info in comb_cells.values():
        dirs = cell_info.get('port_directions', {})
        conns = cell_info.get('connections', {})
        for port, bits in conns.items():
            if dirs.get(port) == 'input':
                comb_input_bits.update(b for b in bits if isinstance(b, int))

    # Bits exclusively consumed by DFF clocks/resets (not by comb logic)
    exclusive_clk   = dff_clk_bits   - comb_input_bits
    exclusive_reset = dff_reset_bits - comb_input_bits
    strip_bits      = exclusive_clk | exclusive_reset

    strip_names = {bit_to_name[b] for b in strip_bits if b in bit_to_name}

    final_inputs  = (declared_inputs  - strip_names) | dff_q_names
    final_outputs = (declared_outputs                ) | dff_d_names

    # ── Generate gate lines ───────────────────────────────────────────────────
    gate_lines  = []
    used_temps  = set()   # avoid duplicate temp signal names across cells

    def fresh(base: str) -> str:
        """Generate a unique temp signal name."""
        name = base
        i = 0
        while name in used_temps or name in final_inputs or name in final_outputs:
            i += 1
            name = f'{base}_{i}'
        used_temps.add(name)
        return name

    def gen_cell(cell_name: str, cell_info: dict) -> None:
        ctype  = cell_info.get('type', '')
        conns  = cell_info.get('connections', {})
        dirs   = cell_info.get('port_directions', {})

        out_bits = [b for p, bits in conns.items()
                    for b in bits if dirs.get(p) == 'output' and isinstance(b, int)]
        in_bits  = [b for p, bits in conns.items()
                    for b in bits if dirs.get(p) == 'input'  and isinstance(b, int)]

        if not out_bits:
            return
        out_sig = sig(out_bits[0])
        if not out_sig:
            return

        in_sigs = [s for b in in_bits if (s := sig(b))]

        gate_type = GATE_MAP.get(ctype)

        # ── MUX: Y = S ? B : A  → AND/OR/NOT tree ────────────────────────────
        if ctype == '$_MUX_':
            a = sig((conns.get('A') or [0])[0])
            b = sig((conns.get('B') or [0])[0])
            s = sig((conns.get('S') or [0])[0])
            if not all([a, b, s]):
                if in_sigs:
                    gate_lines.append(f'{out_sig} = BUFF({in_sigs[0]})')
                return
            ns = fresh(f'{out_sig}_ns')
            t1 = fresh(f'{out_sig}_t1')
            t2 = fresh(f'{out_sig}_t2')
            gate_lines.append(f'{ns} = NOT({s})')
            gate_lines.append(f'{t1} = AND({a}, {ns})')
            gate_lines.append(f'{t2} = AND({b}, {s})')
            gate_lines.append(f'{out_sig} = OR({t1}, {t2})')
            return

        # ── ANDNOT: Y = A & ~B ────────────────────────────────────────────────
        if ctype == '$_ANDNOT_':
            if len(in_sigs) >= 2:
                nb = fresh(f'{out_sig}_nb')
                gate_lines.append(f'{nb} = NOT({in_sigs[1]})')
                gate_lines.append(f'{out_sig} = AND({in_sigs[0]}, {nb})')
            elif in_sigs:
                gate_lines.append(f'{out_sig} = BUFF({in_sigs[0]})')
            return

        # ── ORNOT: Y = A | ~B ─────────────────────────────────────────────────
        if ctype == '$_ORNOT_':
            if len(in_sigs) >= 2:
                nb = fresh(f'{out_sig}_nb')
                gate_lines.append(f'{nb} = NOT({in_sigs[1]})')
                gate_lines.append(f'{out_sig} = OR({in_sigs[0]}, {nb})')
            elif in_sigs:
                gate_lines.append(f'{out_sig} = BUFF({in_sigs[0]})')
            return

        # ── NOT / BUFF: one input ─────────────────────────────────────────────
        if gate_type in ('NOT', 'BUFF'):
            if in_sigs:
                gate_lines.append(f'{out_sig} = {gate_type}({in_sigs[0]})')
            return

        # ── Standard gates: AND, NAND, OR, NOR, XOR, XNOR ───────────────────
        if gate_type and in_sigs:
            gate_lines.append(f'{out_sig} = {gate_type}({", ".join(in_sigs)})')
            return

        # ── Unknown cell — BUFF of first input as fallback ───────────────────
        if in_sigs:
            gate_lines.append(f'{out_sig} = BUFF({in_sigs[0]})')

    for cell_name, cell_info in comb_cells.items():
        gen_cell(cell_name, cell_info)

    for cell_name, cell_info in unknown_cells.items():
        gen_cell(cell_name, cell_info)

    # ── Assemble bench file ───────────────────────────────────────────────────
    lines = [
        f'# ISCAS89 bench — {mod_name}',
        f'# Generated by yosys_json_to_bench.py',
    ]
    if dff_cells:
        lines.append(f'# {len(dff_cells)} DFF(s) unfolded to pseudo-PI/PO for combinational ATPG')
    lines.append('')

    for s in sorted(final_inputs):
        lines.append(f'INPUT({s})')
    for s in sorted(final_outputs):
        lines.append(f'OUTPUT({s})')
    lines.append('')
    lines.extend(gate_lines)
    lines.append('')

    text = '\n'.join(lines)
    with open(bench_path, 'w') as f:
        f.write(text)

    n_comb  = len(comb_cells) + len(unknown_cells)
    n_dff   = len(dff_cells)
    n_gates = len(gate_lines)
    print(
        f'Wrote {bench_path}: {len(final_inputs)} PIs, {len(final_outputs)} POs, '
        f'{n_gates} gates ({n_comb} comb cells, {n_dff} DFFs unfolded)'
    )


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} <in.json> <out.bench>', file=sys.stderr)
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])
