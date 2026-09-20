// Control-socket client for tools that drive the running browser from outside the MCP:
// the labelling trial, the corpus capture, anything else under tools/. Speaks the same
// protocol as tools/mcp/server.js. Launch the browser first (`status` from the MCP, or
// `npm start`); this does not launch it.

'use strict';

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTROL = path.join(ROOT, '.runtime', 'control.json');

class Client {
  constructor(info) { this.info = info; this.seq = 0; this.pending = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${this.info.host}:${this.info.port}`);
      const t = setTimeout(() => reject(new Error('control socket timeout')), 5000);
      ws.once('error', reject);
      ws.once('open', () => ws.send(JSON.stringify({ auth: this.info.token })));
      ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'hello') { clearTimeout(t); this.ws = ws; return resolve(this); }
        if (m.type === 'event') return;
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
      });
    });
  }
  call(cmd, args = {}, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const id = `l${++this.seq}`;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, cmd, args }));
    });
  }
  close() { this.ws.close(); }
}

// Connect to the running browser, restoring the window if it is minimised (a minimised
// window has a 0x0 viewport and nothing on the page is visible).
async function connect() {
  if (!fs.existsSync(CONTROL)) {
    throw new Error('Browser is not running (no .runtime/control.json). Start it with `npm start` or the MCP `status` tool.');
  }
  const client = await new Client(JSON.parse(fs.readFileSync(CONTROL, 'utf8'))).connect();
  const win = await client.call('window', { action: 'get' });
  if (win.minimized) { await client.call('window', { action: 'restore' }); console.log('browser window was minimised; restored it'); }
  return client;
}

module.exports = { Client, connect, ROOT };
