'use strict';
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..', '..');
const paths = {
  root,
  app: path.join(root, 'app'),
  chrome: path.join(root, 'app', 'chrome'),
  config: path.join(root, 'config'),
  settingsFile: path.join(root, 'config', 'settings.json'),
  rules: path.join(root, 'rules'),
  themes: path.join(root, 'themes'),
  pages: path.join(root, 'pages'),
  runtime: path.join(root, '.runtime'),
  userData: path.join(root, '.runtime', 'userData'),
  controlFile: path.join(root, '.runtime', 'control.json'),
  windowFile: path.join(root, '.runtime', 'window.json'),
  logs: path.join(root, '.runtime', 'logs'),
};

for (const p of [paths.runtime, paths.userData, paths.logs, paths.rules, paths.themes, paths.pages]) {
  fs.mkdirSync(p, { recursive: true });
}

const DEFAULT_SETTINGS = {
  homeUrl: 'about:blank',
  searchUrl: 'https://duckduckgo.com/?q=%s',
  defaultProfile: 'lloyd',
  claudeProfile: 'claude',
  theme: 'default',
  control: { host: '127.0.0.1', port: 6510 },
  window: { width: 1440, height: 900 },
  permissions: { allow: ['fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'media'] },
  userAgentSuffix: '',
};

function loadSettings() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(paths.settingsFile, 'utf8')); } catch (_) { /* defaults */ }
  return deepMerge(structuredClone(DEFAULT_SETTINGS), s);
}

function deepMerge(a, b) {
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}

module.exports = { paths, loadSettings, DEFAULT_SETTINGS };
