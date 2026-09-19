'use strict';
// Real sites, blocking off then on. Reports requests stopped and ad elements left standing.
//   node tests/adblock-check.js [url ...]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const CONTROL = path.join(ROOT, '.runtime', 'control.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SITES = process.argv.slice(2).length ? process.argv.slice(2) : [
  'https://www.smh.com.au/',
  'https://www.theage.com.au/',
  'https://www.speedtest.net/',
];

const PROBE = `(() => {
  const vis = (sel) => { try { return [...document.querySelectorAll(sel)].filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(e).display !== 'none';
  }).length; } catch (_) { return -1; } };
  return {
    adIframes: vis('iframe[src*="doubleclick"], iframe[src*="googlesyndication"], iframe[id^="google_ads"], iframe[src*="adnxs"], iframe[src*="amazon-adsystem"]'),
    adSlots:   vis('[id^="div-gpt-ad"], [class*="ad-slot"], [class*="advert"], ins.adsbygoogle, [data-google-query-id]'),
    title: document.title.slice(0, 60),
  };
})()`;

(async () => {
  try { fs.unlinkSync(CONTROL); } catch (_) {}
  const electron = require('electron');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const asRoot = process.platform === 'linux' && process.getuid?.() === 0;
  const needXvfb = !process.env.DISPLAY && process.platform === 'linux';
  const extra = [
    ...(asRoot ? ['--no-sandbox', '--disable-gpu'] : []),
    ...(proxy ? [`--proxy-server=${proxy}`, '--ignore-certificate-errors'] : []),
  ];
  const child = spawn(
    needXvfb ? 'xvfb-run' : electron,
    needXvfb ? ['-a', '-s', '-screen 0 1440x900x24', electron, '.', ...extra] : ['.', ...extra],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', () => {}); child.stderr.on('data', () => {});

  let info = null;
  for (let i = 0; i < 120 && !info; i++) { await sleep(400); try { info = JSON.parse(fs.readFileSync(CONTROL, 'utf8')); } catch (_) {} }
  if (!info) { console.error('browser never started'); process.exit(1); }

  const ws = new WebSocket(`ws://${info.host}:${info.port}`);
  await new Promise((res) => { ws.once('open', () => ws.send(JSON.stringify({ auth: info.token }))); ws.once('message', res); });
  let seq = 0; const pending = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.type) return; const p = pending.get(m.id); if (p) { pending.delete(m.id); m.ok ? p.res(m.result) : p.rej(new Error(m.error)); } });
  const call = (cmd, args = {}) => new Promise((res, rej) => { const id = `a${++seq}`; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, cmd, args })); });

  const st = await call('adblock_status');
  console.log(`lists: ${st.lists}  ready: ${st.ready}  updated: ${st.updatedAt}${st.degraded ? '\n  DEGRADED: ' + st.degraded : ''}\n`);

  const runs = {};
  for (const mode of ['off', 'on']) {
    await call('adblock_set', { enabled: mode === 'on' });
    runs[mode] = {};
    for (const url of SITES) {
      const tab = (await call('tab_open', { url: 'about:blank', profile: 'ab' + mode })).tab;
      try {
        await call('navigate', { tabId: tab.id, url });
        await sleep(7000);
        const probe = (await call('eval_js', { tabId: tab.id, code: PROBE })).value;
        const net = await call('network_read', { tabId: tab.id, limit: 1000 });
        runs[mode][url] = {
          ...probe,
          requests: net.requests.length,
          blocked: net.requests.filter((r) => r.blocked || r.error === 'net::ERR_BLOCKED_BY_CLIENT').length,
        };
      } catch (e) { runs[mode][url] = { error: e.message }; }
      await call('tab_close', { tabId: tab.id });
    }
  }

  for (const url of SITES) {
    const a = runs.off[url] || {}, b = runs.on[url] || {};
    console.log(`── ${url}`);
    if (a.error || b.error) { console.log(`   could not load: ${a.error || b.error}\n`); continue; }
    console.log(`   ${'probe'.padEnd(12)}${'off'.padEnd(10)}on`);
    for (const k of ['requests', 'blocked', 'adIframes', 'adSlots']) {
      console.log(`   ${k.padEnd(12)}${String(a[k]).padEnd(10)}${b[k]}`);
    }
    console.log('');
  }
  const final = await call('adblock_status');
  console.log('engine stats:', JSON.stringify(final.stats));
  await call('adblock_set', { enabled: true });
  try { child.kill('SIGKILL'); } catch (_) {}
  process.exit(0);
})();
