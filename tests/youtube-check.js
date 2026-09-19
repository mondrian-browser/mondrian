'use strict';
// Loads real YouTube pages and reports what the Clean YouTube rule set removed.
//   node tests/youtube-check.js [--shot]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const CONTROL = path.join(ROOT, '.runtime', 'control.json');
const SHOT = process.argv.includes('--shot');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try { fs.unlinkSync(CONTROL); } catch (_) {}
  const electron = require('electron');
  const asRoot = process.platform === 'linux' && process.getuid?.() === 0;
  const needXvfb = !process.env.DISPLAY && process.platform === 'linux';
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const extra = [
    ...(asRoot ? ['--no-sandbox', '--disable-gpu'] : []),
    ...(proxy ? [`--proxy-server=${proxy}`, '--ignore-certificate-errors'] : []),
  ];
  const child = spawn(
    needXvfb ? 'xvfb-run' : electron,
    needXvfb ? ['-a', '-s', '-screen 0 1440x900x24', electron, '.', ...extra] : ['.', ...extra],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let appLog = '';
  child.stdout.on('data', (d) => { appLog += d; });
  child.stderr.on('data', (d) => { appLog += d; });

  let info = null;
  for (let i = 0; i < 100 && !info; i++) { await sleep(400); try { info = JSON.parse(fs.readFileSync(CONTROL, 'utf8')); } catch (_) {} }
  if (!info) { console.error('no control file\n' + appLog); process.exit(1); }

  const ws = new WebSocket(`ws://${info.host}:${info.port}`);
  await new Promise((res) => { ws.once('open', () => ws.send(JSON.stringify({ auth: info.token }))); ws.once('message', res); });
  let seq = 0; const pending = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.type) return; const p = pending.get(m.id); if (p) { pending.delete(m.id); m.ok ? p.res(m.result) : p.rej(new Error(m.error)); } });
  const call = (cmd, args = {}) => new Promise((res, rej) => { const id = `y${++seq}`; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, cmd, args })); });

  const probe = `(() => {
    const vis = (sel) => [...document.querySelectorAll(sel)].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && getComputedStyle(e).display !== 'none';
    }).length;
    return {
      url: location.href,
      shortsShelves: vis('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]'),
      shortsLinks: vis('a[href*="/shorts/"]'),
      sidebarRecs: vis('#secondary ytd-compact-video-renderer, ytd-watch-next-secondary-results-renderer'),
      comments: vis('#comments ytd-comment-thread-renderer, ytd-comments #contents'),
      homeGrid: vis('ytd-browse[page-subtype="home"] ytd-rich-item-renderer'),
      cleanSlate: !!document.getElementById('cb-clean-slate'),
      autoplayOn: !!document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]'),
      player: !!document.querySelector('video'),
      title: (document.querySelector('h1.ytd-watch-metadata, #title h1')||{}).innerText || document.title,
    };
  })()`;

  const pages = [
    ['home', 'https://www.youtube.com/'],
    ['watch', 'https://www.youtube.com/watch?v=aircAruvnKk'],
    ['search', 'https://www.youtube.com/results?search_query=blender+tutorial'],
    ['shorts', 'https://www.youtube.com/shorts/tPEE9ZwTmy0'],
  ];

  const tab = (await call('tab_open', { url: 'about:blank', profile: 'claude' })).tab;
  for (const [name, url] of pages) {
    try {
      await call('navigate', { tabId: tab.id, url });
      await sleep(4500);
      const r = await call('eval_js', { tabId: tab.id, code: probe });
      console.log(`\n${name.toUpperCase()}  ${r.value.url}`);
      for (const [k, v] of Object.entries(r.value)) if (k !== 'url') console.log(`   ${k.padEnd(14)} ${v}`);
      if (SHOT) {
        const s = await call('screenshot', { tabId: tab.id, maxWidth: 1000, format: 'png' });
        fs.writeFileSync(path.join(ROOT, '.runtime', `yt-${name}.png`), Buffer.from(s.base64, 'base64'));
      }
    } catch (e) { console.log(`\n${name.toUpperCase()}  failed: ${e.message}`); }
  }

  const net = await call('network_read', { tabId: tab.id, limit: 400 });
  console.log(`\nblocked requests: ${net.requests.filter((r) => r.blocked).length}`);
  const rules = await call('rules_list');
  console.log('rule hits:', JSON.stringify(rules.rules.find((r) => r.name === 'youtube')?.hits));

  try { child.kill('SIGKILL'); } catch (_) {}
  process.exit(0);
})();
