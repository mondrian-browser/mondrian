#!/usr/bin/env node
'use strict';
// Registers the browser's MCP server with the Claude desktop app, alongside
// Filesystem and Blender. Run once:  npm run install-mcp
// Undo with:  npm run install-mcp -- --remove

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
// NOT "claude-browser": the desktop app reserves that for its own built-in browser pane
// and refuses to start a server whose name normalises onto a reserved one.
const NAME = 'cbrowser';
const OLD_NAMES = ['claude-browser'];
const REMOVE = process.argv.includes('--remove');

function configPath() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

const file = configPath();
let config = {};
if (fs.existsSync(file)) {
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error(`${file} is not valid JSON. Fix it first; nothing was changed.`); process.exit(1); }
  fs.copyFileSync(file, file + '.bak');
} else {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

config.mcpServers = config.mcpServers || {};

// Clear out any earlier registration under a name that no longer works.
for (const old of OLD_NAMES) {
  if (config.mcpServers[old]) { delete config.mcpServers[old]; console.log(`Removed the old "${old}" entry.`); }
}

if (REMOVE) {
  if (!config.mcpServers[NAME]) { console.log(`${NAME} was not registered. Nothing to do.`); }
  delete config.mcpServers[NAME];
} else {
  config.mcpServers[NAME] = {
    command: process.execPath,
    args: [path.join(ROOT, 'tools', 'mcp', 'server.js')],
  };
}

fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log(`${REMOVE ? 'Removed' : 'Registered'} "${NAME}" in ${file}`);
if (fs.existsSync(file + '.bak')) console.log(`Previous config saved as ${path.basename(file)}.bak`);
console.log('Now quit the Claude desktop app completely and reopen it.');
console.log(`Servers currently registered: ${Object.keys(config.mcpServers).join(', ') || 'none'}`);
