'use strict';
// Localhost control server. The MCP bridge (and anything else you write) connects here.
// Protocol, newline-free JSON frames over a WebSocket:
//   in : { id, cmd, args }            out: { id, ok: true, result } | { id, ok: false, error }
//   out: { type: "event", event: {...} }   (tab changes, notes, rule reloads)
// Auth: first frame must be { auth: "<token from .runtime/control.json>" }.

const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { paths } = require('./paths');
const log = require('./log').make('control');

class ControlServer {
  constructor({ settings, dispatch }) {
    this.settings = settings;
    this.dispatch = dispatch;
    this.clients = new Set();
    this.token = crypto.randomBytes(24).toString('hex');
    this.port = null;
    this.wss = null;
  }

  async start() {
    const host = this.settings.control?.host || '127.0.0.1';
    const first = Number(this.settings.control?.port || 6510);
    for (let port = first; port < first + 20; port++) {
      try {
        await this.listen(host, port);
        this.port = port;
        break;
      } catch (e) {
        if (e.code !== 'EADDRINUSE') throw e;
      }
    }
    if (!this.port) throw new Error(`No free port in ${first}..${first + 19} for the control server.`);
    fs.writeFileSync(paths.controlFile, JSON.stringify({
      host, port: this.port, token: this.token, pid: process.pid, startedAt: new Date().toISOString(),
    }, null, 2));
    log.info(`control server on ws://${host}:${this.port}`);
    return this.port;
  }

  listen(host, port) {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host, port });
      wss.once('error', reject);
      wss.once('listening', () => { wss.off('error', reject); this.wss = wss; this.wire(); resolve(); });
    });
  }

  wire() {
    this.wss.on('connection', (ws, req) => {
      const addr = req.socket.remoteAddress;
      if (addr !== '127.0.0.1' && addr !== '::1' && addr !== '::ffff:127.0.0.1') { ws.close(1008, 'local only'); return; }
      let authed = false;
      ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (_) { return ws.send(JSON.stringify({ ok: false, error: 'bad json' })); }
        if (!authed) {
          if (msg.auth !== this.token) { ws.close(1008, 'bad token'); return; }
          authed = true;
          this.clients.add(ws);
          ws.send(JSON.stringify({ type: 'hello', ok: true }));
          return;
        }
        const { id, cmd, args } = msg;
        try {
          const result = await this.dispatch(cmd, args || {});
          ws.send(JSON.stringify({ id, ok: true, result }));
        } catch (e) {
          log.warn('cmd failed', cmd, e.message);
          ws.send(JSON.stringify({ id, ok: false, error: String(e?.message || e) }));
        }
      });
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });
  }

  broadcast(event) {
    const frame = JSON.stringify({ type: 'event', event });
    for (const ws of this.clients) { try { ws.send(frame); } catch (_) {} }
  }

  stop() {
    try { this.wss?.close(); } catch (_) {}
    try { fs.unlinkSync(paths.controlFile); } catch (_) {}
  }
}

module.exports = { ControlServer };
