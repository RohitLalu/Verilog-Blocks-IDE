'use strict';
// The waveform viewer's VCD parser (src/lib/vcdParser.js), on a file shaped like Icarus Verilog's output.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/loadModule.js');
const { parseVCD } = load('src/lib/vcdParser.js');

const VCD = `$date today $end
$timescale
	1ps
$end
$scope module top_tb $end
$var wire 1 ! y $end
$var reg 1 " a $end
$var reg 4 # bus [3:0] $end
$upscope $end
$enddefinitions $end
$comment Show the parameter values. $end
$dumpall
$end
#0
$dumpvars
0!
1"
b0101 #
$end
#20000
1!
#30000
b1111 #
`;

test('initial values inside $dumpvars are kept (a signal that never changes still has a value)', () => {
  const p = parseVCD(VCD);
  const sig = name => p.signals.find(s => s.name === name);
  assert.deepEqual(sig('a').transitions, [{ time: 0, value: 1 }]);
  assert.deepEqual(sig('y').transitions, [{ time: 0, value: 0 }, { time: 20000, value: 1 }]);
  assert.deepEqual(sig('bus').transitions, [{ time: 0, value: 5 }, { time: 30000, value: 15 }]);
  assert.equal(p.endTime, 30000);
});

test('a net seen from several scopes (same id) is shown under its top-most name', () => {
  const p = parseVCD(`$timescale 1ns $end
$scope module tb $end
$var reg 1 ! x $end
$scope module dut $end
$var wire 1 ! a $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
$dumpvars
0!
$end
#5
1!
`);
  assert.deepEqual(p.signals.map(s => s.name), ['x']);
  assert.deepEqual(p.signals[0].transitions, [{ time: 0, value: 0 }, { time: 5, value: 1 }]);
});
