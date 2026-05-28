#!/usr/bin/env node
// MCP stdio <-> SSE bridge using curl subprocesses
// Avoids Node.js undici/fetch proxy issues — curl handles HTTP_PROXY correctly
// Reconnects automatically when the SSE stream drops
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const SSE_URL = 'http://host.docker.internal:8080/sse';
const BASE_URL = 'http://host.docker.internal:8080';
const RECONNECT_DELAY_MS = 5000;

let sessionId = null;
const pending = [];

function postViaCurl(body) {
  if (!sessionId) { pending.push(body); return; }
  const url = `${BASE_URL}/message?sessionId=${sessionId}`;
  const curl = spawn('curl', [
    '-s', '-X', 'POST', url,
    '-H', 'Content-Type: application/json',
    '--data-binary', JSON.stringify(body)
  ]);
  curl.stderr.on('data', d => process.stderr.write('[post-err] ' + d));
}

function connect() {
  sessionId = null;
  const sseProc = spawn('curl', ['-sN', '--no-buffer', SSE_URL]);
  let buf = '';

  sseProc.stdout.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('data: /message?sessionId=')) {
        sessionId = line.slice('data: /message?sessionId='.length).trim();
        process.stderr.write(`[bridge] connected sessionId=${sessionId}\n`);
        for (const msg of pending.splice(0)) postViaCurl(msg);
      } else if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim();
        if (payload) process.stdout.write(payload + '\n');
      }
    }
  });

  sseProc.stderr.on('data', d => process.stderr.write('[sse-err] ' + d));
  sseProc.on('exit', code => {
    process.stderr.write(`[bridge] SSE stream dropped (code ${code}), reconnecting in ${RECONNECT_DELAY_MS / 1000}s...\n`);
    sessionId = null;
    setTimeout(connect, RECONNECT_DELAY_MS);
  });
}

connect();

// Read stdin
const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  try { postViaCurl(JSON.parse(line)); } catch {}
});
rl.on('close', () => process.exit(0));
