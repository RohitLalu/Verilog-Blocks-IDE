import useStore from '../store/graphStore.js';
import { generateTestbench } from '../codegen/graphToVerilog.js';

const EMPTY = '// Empty design\nmodule top();\nendmodule';

// Runs iverilog via the backend and routes the result into the simulator panel.
// Shared by the Toolbar ⚡ Sim button and the Testbench panel ▶ iverilog button.
export async function runSimulation() {
  const s = useStore.getState();
  if (!window.api) { s.pushNotification('iverilog requires Docker — use docker compose up -d', 'warn'); return; }
  const verilog = s.generatedVerilog;
  if (!verilog || verilog.trim() === EMPTY) { s.pushNotification('Generate Verilog first (</> button)', 'warn'); return; }

  const tb = generateTestbench(s.nodes, s.edges, s.projectName, s.testbenchInputs,
    s.useCustomTestbench ? s.customTestbench : '');
  s.setGeneratedTestbench(tb);
  s.setSimRunning(true); s.setSimOutput('');
  try {
    const res = await window.api.sim.run({ projectName: s.projectName, verilog, testbench: tb });
    s.setSimOutput(res.output || '');
    if (res.vcd) {
      s.setLastVCD(res.vcd);
      s.pushNotification('Simulation complete ✓', 'success');
    } else {
      s.pushNotification(res.ok ? 'Simulation done (no VCD)' : 'Simulation error', 'error');
    }
    s.setActivePanel('simulator');   // console output is visible there even without a VCD
  } catch (e) {
    s.setSimOutput('Request failed: ' + e.message);
    s.pushNotification('Simulation request failed', 'error');
  } finally {
    s.setSimRunning(false);
  }
}
