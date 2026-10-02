// ────────────────────────────────────────────────────────────
// Testbench — VerilogBlocks IDE  my_project  2026-09-16 09:48:33
// ────────────────────────────────────────────────────────────

`timescale 1ns / 1ps

module top_tb;

    reg  my_project_1_sky130_and3_1_A;
    reg  my_project_1_sky130_and3_1_B;
    reg  my_project_1_sky130_and3_1_C;
    reg  my_project_1_sky130_inv2_1_A;
    wire my_project_1_sky130_or2_1_X;

    top dut (
        .my_project_1_sky130_and3_1_A(my_project_1_sky130_and3_1_A),
        .my_project_1_sky130_and3_1_B(my_project_1_sky130_and3_1_B),
        .my_project_1_sky130_and3_1_C(my_project_1_sky130_and3_1_C),
        .my_project_1_sky130_inv2_1_A(my_project_1_sky130_inv2_1_A),
        .my_project_1_sky130_or2_1_X(my_project_1_sky130_or2_1_X)
    );


    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0,top_tb);
        my_project_1_sky130_and3_1_A=1'b0;
        my_project_1_sky130_and3_1_B=1'b0;
        my_project_1_sky130_and3_1_C=1'b0;
        my_project_1_sky130_inv2_1_A=1'b0;

        #10;  my_project_1_sky130_and3_1_A=$urandom;
        #10;  my_project_1_sky130_and3_1_A=$urandom;
        #10;  my_project_1_sky130_and3_1_A=$urandom;
        #10;  my_project_1_sky130_and3_1_A=$urandom;
        #10;  my_project_1_sky130_and3_1_A=$urandom;
        #10;  my_project_1_sky130_and3_1_A=$urandom;
        #10;  my_project_1_sky130_and3_1_A=$urandom;
        #10;  my_project_1_sky130_and3_1_A=$urandom;
        #10;  my_project_1_sky130_and3_1_B=$urandom;
        #10;  my_project_1_sky130_and3_1_B=$urandom;
        #10;  my_project_1_sky130_and3_1_B=$urandom;
        #10;  my_project_1_sky130_and3_1_B=$urandom;
        #10;  my_project_1_sky130_and3_1_B=$urandom;
        #10;  my_project_1_sky130_and3_1_B=$urandom;
        #10;  my_project_1_sky130_and3_1_B=$urandom;
        #10;  my_project_1_sky130_and3_1_B=$urandom;
        #10;  my_project_1_sky130_and3_1_C=$urandom;
        #10;  my_project_1_sky130_and3_1_C=$urandom;
        #10;  my_project_1_sky130_and3_1_C=$urandom;
        #10;  my_project_1_sky130_and3_1_C=$urandom;
        #10;  my_project_1_sky130_and3_1_C=$urandom;
        #10;  my_project_1_sky130_and3_1_C=$urandom;
        #10;  my_project_1_sky130_and3_1_C=$urandom;
        #10;  my_project_1_sky130_and3_1_C=$urandom;
        #10;  my_project_1_sky130_inv2_1_A=$urandom;
        #10;  my_project_1_sky130_inv2_1_A=$urandom;
        #10;  my_project_1_sky130_inv2_1_A=$urandom;
        #10;  my_project_1_sky130_inv2_1_A=$urandom;
        #10;  my_project_1_sky130_inv2_1_A=$urandom;
        #10;  my_project_1_sky130_inv2_1_A=$urandom;
        #10;  my_project_1_sky130_inv2_1_A=$urandom;
        #10;  my_project_1_sky130_inv2_1_A=$urandom;

        #500; $display("Simulation done."); $finish;
    end

    initial $monitor("t=%0t  my_project_1_sky130_and3_1_A=%b  my_project_1_sky130_and3_1_B=%b  my_project_1_sky130_and3_1_C=%b  my_project_1_sky130_inv2_1_A=%b  my_project_1_sky130_or2_1_X=%b",$time,my_project_1_sky130_and3_1_A, my_project_1_sky130_and3_1_B, my_project_1_sky130_and3_1_C, my_project_1_sky130_inv2_1_A, my_project_1_sky130_or2_1_X);

endmodule