'use strict';
const fs = require('fs');
const path = require('path');
const { paths } = require('./paths');

const file = path.join(paths.logs, `browser-${new Date().toISOString().slice(0, 10)}.log`);
let stream = null;
try { stream = fs.createWriteStream(file, { flags: 'a' }); } catch (_) { /* no file log */ }

function fmt(level, scope, args) {
  const msg = args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' ');
  return `${new Date().toISOString()} ${level.padEnd(5)} [${scope}] ${msg}`;
}

function safeJson(v) {
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}

function make(scope) {
  const out = (level) => (...args) => {
    const line = fmt(level, scope, args);
    if (level === 'error' || level === 'warn' || process.argv.includes('--dev')) process.stderr.write(line + '\n');
    if (stream) stream.write(line + '\n');
  };
  return { info: out('info'), warn: out('warn'), error: out('error'), debug: out('debug') };
}

module.exports = { make, file };
