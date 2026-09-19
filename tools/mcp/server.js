#!/usr/bin/env node
'use strict';
// MCP bridge: exposes every browser command as a tool over stdio.
// Register this in the Claude desktop app (npm run install-mcp) and the browser
// becomes steerable from any Claude session.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { commands } = require('../../shared/commands.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTROL_FILE = path.join(ROOT, '.runtime', 'control.json');
const MAX_TEXT = 120000;
const READ_ONLY = new Set(['status', 'tabs_list', 'page_text', 'page_read', 'find', 'screenshot', 'console_read', 'network_read', 'rules_list', 'rules_get', 'profiles_list', 'theme_list']);

const err = (...a) => process.stderr.write(`[cbrowser-mcp] ${a.join(' ')}\n`);

// ---------------------------------------------------------------- connection
class Link {
  constructor() { this.ws = null; this.seq = 0; this.pending = new Map(); this.connecting = null; }

  readControl() {
    try { return JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8')); } catch (_) { return null; }
  }

  alive() { return this.ws && this.ws.readyState === WebSocket.OPEN; }

  async ensure() {
    if (this.alive()) return;
    if (this.connecting) return this.connecting;
    this.connecting = this._ensure().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async _ensure() {
    const info = this.readControl();
    if (info) { try { await this.connect(info); return; } catch (_) { /* stale; relaunch */ } }
    await this.launch();
  }

  connect(info, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${info.host}:${info.port}`);
      const timer = setTimeout(() => { try { ws.terminate(); } catch (_) {} reject(new Error('connect timeout')); }, timeoutMs);
      ws.once('error', (e) => { clearTimeout(timer); reject(e); });
      ws.once('open', () => {
        ws.send(JSON.stringify({ auth: info.token }));
      });
      ws.on('message', (raw) => {
        let msg; try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
        if (msg.type === 'hello') {
          clearTimeout(timer);
          this.ws = ws;
          err(`connected to browser on port ${info.port}`);
          resolve();
          return;
        }
        if (msg.type === 'event') return;
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
      });
      ws.on('close', () => {
        if (this.ws === ws) this.ws = null;
        for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('Browser connection closed.')); }
        this.pending.clear();
      });
    });
  }

  async launch() {
    const before = this.readControl();
    let electron;
    try { electron = require('electron'); } catch (_) { electron = null; }
    if (typeof electron !== 'string') {
      throw new Error(`Electron is not installed. Run: npm install --prefix "${ROOT}"`);
    }
    err('starting the browser…');
    const asRoot = process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0;
    const args = asRoot ? ['.', '--no-sandbox'] : ['.'];
    const child = spawn(electron, args, { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, CB_ANNOUNCE: '1' } });
    child.unref();

    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400));
      const info = this.readControl();
      if (info && (!before || info.pid !== before.pid || info.startedAt !== before.startedAt)) {
        try { await this.connect(info, 2500); return; } catch (_) { /* not up yet */ }
      }
    }
    throw new Error('The browser did not start within 45 s. Try running it by hand: npm start');
  }

  async call(cmd, args, timeoutMs = 60000) {
    await this.ensure();
    if (!this.alive()) throw new Error('No connection to the browser.');
    return new Promise((resolve, reject) => {
      const id = `m${++this.seq}`;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`"${cmd}" timed out after ${timeoutMs} ms.`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ id, cmd, args })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
}

const link = new Link();

// ---------------------------------------------------------------- result shaping
function toContent(cmdName, result) {
  if (cmdName === 'screenshot' && result?.base64) {
    return {
      content: [
        { type: 'text', text: `${result.title || ''} — ${result.url || ''} (${result.width}x${result.height})`.trim() },
        { type: 'image', data: result.base64, mimeType: result.mimeType },
      ],
    };
  }
  let text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + `\n… truncated at ${MAX_TEXT} characters. Narrow the request (maxItems, maxChars, selector).`;
  return { content: [{ type: 'text', text }] };
}

// ---------------------------------------------------------------- server
const server = new McpServer(
  { name: 'cbrowser', version: require('../../package.json').version },
  { capabilities: { tools: {} }, instructions:
`Claude Browser — a browser built to be steered.

Start with status (it launches the browser if it is not running) or tab_open.
Read a page with page_text for prose, page_read for a list of elements with refs,
find to locate something by its visible text. Act with click/type/press_key/scroll
using a ref from page_read or find; refs go stale after a navigation, so read again.
screenshot when the layout itself matters.

Two things make this browser different from driving someone else's:
  - rules_set writes a site rule (block requests, strip CSS, inject JS) that applies
    to every load of a matching site, live, and persists in rules/<name>.json.
  - ui_css and ui_eval restyle and reprogram the browser's own interface at runtime.
Use ui_note to tell Lloyd what you are doing; it shows in the activity panel.

Profiles are separate cookie jars. Keep Claude's own accounts in the "claude" profile
and leave "lloyd" alone unless he asks.`,
  },
);

for (const c of commands) {
  server.registerTool(
    c.name,
    {
      title: c.name,
      description: c.description,
      inputSchema: c.input,
      annotations: { readOnlyHint: READ_ONLY.has(c.name), openWorldHint: true },
    },
    async (args) => {
      try {
        const result = await link.call(c.name, args ?? {});
        return toContent(c.name, result);
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: String(e?.message || e) }] };
      }
    },
  );
}

(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  err(`ready — ${commands.length} tools, project at ${ROOT}`);
})().catch((e) => { err('fatal', e.stack || e.message); process.exit(1); });
