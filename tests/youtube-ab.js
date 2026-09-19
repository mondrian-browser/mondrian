'use strict';
// A/B: the same YouTube pages with the Clean YouTube rule set off, then on.
// A zero only means something if the same probe is non-zero with the rules off.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const CONTROL = path.join(ROOT, '.runtime', 'control.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `(() => {
  const vis = (sel) => { try { return [...document.querySelectorAll(sel)].filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(e).display !== 'none';
  }).length; } catch (_) { return -1; } };
  return {
    shortsShelf:  vis('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]'),
    shortsLinks:  vis('a[href*="/shorts/"]'),
    sidebarRecs:  vis('#secondary ytd-compact-video-renderer'),
    comments:     vis('#comments ytd-comment-thread-renderer'),
    homeItems:    vis('ytd-browse[page-subtype="home"] ytd-rich-item-renderer'),
    navShorts:    vis('ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-mini-guide-entry-renderer[aria-label="Shorts"]'),
    endscreen:    vis('.ytp-endscreen-content, .ytp-ce-element'),
    autonavBtn:   document.querySelectorAll('.ytp-autonav-toggle-button').length,
    autonavOn:    document.querySelectorAll('.ytp-autonav-toggle-button[aria-checked="true"]').length,
    cleanSlate:   !!document.getElementById('cb-clean-slate'),
    browseSubtype: (document.querySelector('ytd-browse') || {}).getAttribute ? document.querySelector('ytd-browse').getAttribute('page-subtype') : null,
    url: location.href,
  };
})()`;

(async () => {
  try { fs.unlinkSync(CONTROL); } catch (_) {}
  const electron = require('electron');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const extra = ['--no-sandbox', '--disable-gpu', ...(proxy ? [`--proxy-server=${proxy}`, '--ignore-certificate-errors'] : [])];
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1440x900x24', electron, '.', ...extra], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {});
  child.stdout.on('data', () => {});

  let info = null;
  for (let i = 0; i < 100 && !info; i++) { await sleep(400); try { info = JSON.parse(fs.readFileSync(CONTROL, 'utf8')); } catch (_) {} }
  const ws = new WebSocket(`ws://${info.host}:${info.port}`);
  await new Promise((res) => { ws.once('open', () => ws.send(JSON.stringify({ auth: info.token }))); ws.once('message', res); });
  let seq = 0; const pending = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.type) return; const p = pending.get(m.id); if (p) { pending.delete(m.id); m.ok ? p.res(m.result) : p.rej(new Error(m.error)); } });
  const call = (cmd, args = {}) => new Promise((res, rej) => { const id = `y${++seq}`; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, cmd, args })); });

  const pages = [
    ['home',   'https://www.youtube.com/'],
    ['watch',  'https://www.youtube.com/watch?v=aircAruvnKk'],
    ['search', 'https://www.youtube.com/results?search_query=blender+donut+tutorial'],
  ];

  const runs = {};
  for (const mode of ['off', 'on']) {
    await call('rules_toggle', { name: 'youtube', enabled: mode === 'on' });
    const tab = (await call('tab_open', { url: 'about:blank', profile: mode })).tab;
    runs[mode] = {};
    for (const [name, url] of pages) {
      await call('navigate', { tabId: tab.id, url });
      await sleep(9000); // let the SPA settle and the autoplay watcher fire
      runs[mode][name] = (await call('eval_js', { tabId: tab.id, code: PROBE })).value;
    }
    await call('tab_close', { tabId: tab.id });
  }

  const keys = ['shortsShelf', 'shortsLinks', 'sidebarRecs', 'comments', 'homeItems', 'navShorts', 'endscreen', 'autonavBtn', 'autonavOn', 'cleanSlate', 'browseSubtype'];
  for (const [name] of pages) {
    console.log(`\n── ${name}  ${runs.on[name].url}`);
    console.log('   ' + 'probe'.padEnd(14) + 'rules off'.padEnd(12) + 'rules on');
    for (const k of keys) {
      const a = runs.off[name][k], b = runs.on[name][k];
      const flag = (typeof a === 'number' && a > 0 && b === 0) ? '  <- removed' : (a === b ? '' : '  <- changed');
      console.log('   ' + k.padEnd(14) + String(a).padEnd(12) + String(b) + flag);
    }
  }
  try { child.kill('SIGKILL'); } catch (_) {}
  process.exit(0);
})();
