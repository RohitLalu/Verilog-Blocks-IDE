// ────────────────────────────────────────────────────────────
// VerilogBlocks IDE — my_project   2026-09-16 09:48:20
// PDK: SkyWater 130nm High-Density standard cell library — 50 cells (sky130)
// Blocks:1  Wires:0
// ────────────────────────────────────────────────────────────

// No submodule includes

`timescale 1ns / 1ps

module top (
    input  wire my_project_1_sky130_and3_1_A,
    input  wire my_project_1_sky130_and3_1_B,
    input  wire my_project_1_sky130_and3_1_C,
    input  wire my_project_1_sky130_inv2_1_A,
    output wiremy_project_1_sky130_or2_1_X
);


    // ── Logic ────────────────────────────────────────────────────────
    // test [my_project_1]
    // ────────────────────────────────────────────────────────────
    // VerilogBlocks IDE — my_project   2026-09-16 09:47:42
    // PDK: SkyWater 130nm High-Density standard cell library — 50 cells (sky130)
    // Blocks:3  Wires:2
    // ────────────────────────────────────────────────────────────
    
    // No submodule includes
    
    `timescale 1ns / 1ps
    
    module top (
        input  wire sky130_and3_1_A,
        input  wire sky130_and3_1_B,
        input  wire sky130_and3_1_C,
        input  wire sky130_inv2_1_A,
        output wiresky130_or2_1_X
    );
    
        // Internal signals
        wire sky130_and3_1_sky130_or2_1_X_0;
        wire sky130_inv2_1_sky130_or2_1_Y_0;
    
        // ── Logic ────────────────────────────────────────────────────────
        // AND3 [sky130_and3_1]
        assign sky130_and3_1_sky130_or2_1_X_0=sky130_and3_1_A&sky130_and3_1_B&sky130_and3_1_C;
    
        // OR2 [sky130_or2_1]
        assign sky130_or2_1_X=sky130_and3_1_sky130_or2_1_X_0|sky130_inv2_1_sky130_or2_1_Y_0;
    
        // INV (str2) [sky130_inv2_1]
        assign sky130_inv2_1_sky130_or2_1_Y_0=~sky130_inv2_1_A;
    
    endmodule

endmodule