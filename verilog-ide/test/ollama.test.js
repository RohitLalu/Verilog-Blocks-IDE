'use strict';
// The learning assistant's Ollama client (src/lib/ollama.js), against a fake Ollama that streams like the real one.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { load } = require('./helpers/loadModule.js');
const { installedModels, pullModel, chat, buildMessages, readNdjson, createTutor, DEFAULT_MODEL, TUTOR_MODEL, TUTOR_SYSTEM } = load('src/lib/ollama.js');

let server, base, lastChat, lastCreate;
test.before(async () => {
  server = http.createServer((req, res) => {
    let body = ''; req.on('data', d => body += d);
    req.on('end', () => {
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: DEFAULT_MODEL }] }));
      res.setHeader('Content-Type', 'application/x-ndjson');
      if (req.url === '/api/pull') {
        // split a JSON line across two writes, as a real network can
        res.write('{"status":"pulling","total":100,"completed":25}\n{"status":"pul');
        setTimeout(() => { res.write('ling","total":100,"completed":100}\n'); res.end('{"status":"success"}\n'); }, 10);
        return;
      }
      if (req.url === '/api/create') {
        lastCreate = JSON.parse(body);
        res.write('{"status":"using existing layer"}\n');
        return res.end('{"status":"success"}\n');
      }
      if (req.url === '/api/chat') {
        lastChat = JSON.parse(body);
        for (const t of ['A full ', 'adder ', 'adds three bits.']) res.write(JSON.stringify({ message: { role: 'assistant', content: t }, done: false }) + '\n');
        return res.end(JSON.stringify({ done: true }) + '\n');
      }
      res.statusCode = 404; res.end('not found');
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise(r => server.close(r)));

test('installed models are listed; no Ollama running gives null (not an error)', async () => {
  assert.deepEqual(await installedModels(base), [DEFAULT_MODEL]);
  assert.equal(await installedModels('http://127.0.0.1:9'), null);
});

test('model download reports progress, even when a line is split across network chunks', async () => {
  const seen = [];
  await pullModel(DEFAULT_MODEL, (f, s) => seen.push([f, s]), { base });
  assert.deepEqual(seen, [[0.25, 'pulling'], [1, 'pulling'], [null, 'success']]);
});

test('chat streams the answer piece by piece and sends the student\'s work with the question', async () => {
  const pieces = [];
  const all = await chat(TUTOR_MODEL, buildMessages([{ role: 'user', content: 'What is this?' }], 'Generated Verilog: module top(); endmodule'), t => pieces.push(t), { base });
  assert.deepEqual(pieces, ['A full ', 'adder ', 'adds three bits.']);
  assert.equal(all, 'A full adder adds three bits.');
  assert.equal(lastChat.model, TUTOR_MODEL); assert.equal(lastChat.stream, true);
  assert.equal(lastChat.messages[0].role, 'system'); assert.match(lastChat.messages[0].content, /module top\(\); endmodule/);
  assert.deepEqual(lastChat.messages.slice(1), [{ role: 'user', content: 'What is this?' }]);
});

test('the tutor model carries the IDE instructions itself; any other model gets them in the request', () => {
  const tutor = buildMessages([{ role: 'user', content: 'hi', extra: 1 }], 'ctx');
  assert.doesNotMatch(tutor[0].content, /tutor built into VerilogBlocks IDE/);
  assert.match(tutor[0].content, /ctx/);
  assert.deepEqual(tutor[1], { role: 'user', content: 'hi' });
  const other = buildMessages([{ role: 'user', content: 'hi' }], 'ctx', 'llama3.2:3b');
  assert.match(other[0].content, /tutor built into VerilogBlocks IDE/); assert.match(other[0].content, /ctx/);
  assert.deepEqual(buildMessages([{ role: 'user', content: 'hi' }], '').map(m => m.role), ['user'], 'tutor, no context: just the question');
});

test('the tutor is built from the base model with the IDE instructions and teaching settings', async () => {
  const seen = [];
  await createTutor(s => seen.push(s), { base });
  assert.deepEqual(seen, ['using existing layer', 'success']);
  assert.equal(lastCreate.model, TUTOR_MODEL); assert.equal(lastCreate.from, DEFAULT_MODEL);
  assert.equal(lastCreate.system, TUTOR_SYSTEM); assert.equal(lastCreate.parameters.temperature, 0.3);
});

test('an error line from Ollama is reported', async () => {
  const body = new Blob(['{"error":"model not found"}\n']).stream();
  await assert.rejects(readNdjson(body, o => { if (o.error) throw new Error(o.error); }), /model not found/);
});
