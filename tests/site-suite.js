'use strict';
// Real-site suite. Loads a spread of live sites and runs the whole command set
// against each, so breakage shows up on the kind of page Lloyd will actually open
// rather than on a fixture built to pass.
//
//   node tests/site-suite.js                 all sites
//   node tests/site-suite.js --only news     sites whose key contains "news"
//   node tests/site-suite.js --keep          leave the browser running
//   node tests/site-suite.js --shot          save a screenshot per site
//
// Exit code is the number of sites with at least one failure, capped at 250.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const CONTROL = path.join(ROOT, '.runtime', 'control.json');
const KEEP = process.argv.includes('--keep');
const SHOT = process.argv.includes('--shot');
// argv.indexOf returns -1 when the flag is absent, and argv[0] is the node binary,
// so an unguarded indexOf + 1 silently filters every site out.
const onlyIdx = process.argv.indexOf('--only');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1]
  || (onlyIdx >= 0 ? process.argv[onlyIdx + 1] : '')
  || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A spread of shapes rather than a list of favourites: server-rendered, SPA,
// documentation, search, heavy-media, strict-CSP, cookie-wall, slow.
const SITES = [
  { key: 'wikipedia',  url: 'https://en.wikipedia.org/wiki/Bauhaus',            expect: 'Bauhaus',        search: 'input[name="search"]' },
  { key: 'mdn',        url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/display', expect: 'display' },
  { key: 'hackernews', url: 'https://news.ycombinator.com/',                    expect: 'comments' },
  { key: 'github',     url: 'https://github.com/electron/electron',             expect: 'electron' },
  { key: 'duckduckgo', url: 'https://duckduckgo.com/?q=bauhaus+typography',     expect: 'bauhaus' },
  { key: 'bbcnews',    url: 'https://www.bbc.com/news',                         expect: 'news' },
  { key: 'theage',     url: 'https://www.theage.com.au/',                       expect: 'the age' },
  { key: 'abcnews-au', url: 'https://www.abc.net.au/news',                      expect: 'news' },
  { key: 'youtube',    url: 'https://www.youtube.com/watch?v=aircAruvnKk',      expect: 'neural network' },
  { key: 'vimeo',      url: 'https://vimeo.com/watch',                          expect: 'vimeo' },
  { key: 'reddit',     url: 'https://www.reddit.com/r/blender/',                expect: 'blender' },
  { key: 'stackoverflow', url: 'https://stackoverflow.com/questions/tagged/electron', expect: 'electron' },
  { key: 'archive',    url: 'https://archive.org/details/texts',                expect: 'archive' },
  { key: 'gov-au',     url: 'https://www.education.vic.gov.au/Pages/default.aspx', expect: 'education' },
  { key: 'vcaa',       url: 'https://www.vcaa.vic.edu.au/Pages/HomePage.aspx',  expect: 'vcaa' },
  { key: 'blender',    url: 'https://www.blender.org/',                         expect: 'blender' },
  { key: 'godot',      url: 'https://docs.godotengine.org/en/stable/',          expect: 'godot' },
  { key: 'npm',        url: 'https://www.npmjs.com/package/electron',           expect: 'electron' },
  { key: 'amazon',     url: 'https://www.amazon.com.au/s?k=3d+printer+filament', expect: 'filament' },
  { key: 'speedtest',  url: 'https://www.speedtest.net/',                       expect: 'speedtest' },
];

// ---------------------------------------------------------------- control client
class Client {
  constructor(info) { this.info = info; this.seq = 0; this.pending = new Map(); this.events = []; }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${this.info.host}:${this.info.port}`);
      const t = setTimeout(() => reject(new Error('connect timeout')), 8000);
      ws.once('error', reject);
      ws.once('open', () => ws.send(JSON.stringify({ auth: this.info.token })));
      ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'hello') { clearTimeout(t); this.ws = ws; return resolve(this); }
        if (m.type === 'event') { this.events.push(m.event); return; }
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
      });
    });
  }
  call(cmd, args = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const id = `s${++this.seq}`;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${cmd} timed out after ${timeoutMs}ms`)); }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, cmd, args }));
    });
  }
}

// ---------------------------------------------------------------- per-site checks
const HEALTH = `(() => {
  const vis = (sel) => { try { return [...document.querySelectorAll(sel)].filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(e).display !== 'none';
  }).length; } catch (_) { return -1; } };
  const body = document.body;
  return {
    readyState: document.readyState,
    title: document.title.slice(0, 80),
    textChars: (body && body.innerText || '').length,
    visibleElements: vis('a, button, input, h1, h2, p, img'),
    links: document.querySelectorAll('a[href]').length,
    bodyHeight: body ? Math.round(body.getBoundingClientRect().height) : 0,
    scrollHeight: document.documentElement.scrollHeight,
    hasStyleFromRules: !!document.querySelector('style[data-claude-browser]'),
    adIframes: vis('iframe[src*="doubleclick"], iframe[src*="googlesyndication"], ins.adsbygoogle'),
  };
})()`;

// This machine is a datacentre IP behind an egress proxy, so a fair number of sites
// answer with a bot wall rather than their content. That is not the browser being
// broken, and a suite that reports it as failure teaches you to ignore the suite.
const BLOCKED_SIGNS = [
  /access denied/i, /just a moment/i, /are you a robot/i, /unusual traffic/i,
  /captcha/i, /enable javascript and cookies/i, /request blocked/i, /forbidden/i,
  /not enabled for this session/i, /cloudflare/i, /rate limit/i, /too many requests/i,
];

function looksBlocked(text, title) {
  const hay = `${title || ''}\n${(text || '').slice(0, 1500)}`;
  return BLOCKED_SIGNS.find((re) => re.test(hay)) || null;
}

async function checkSite(c, site, out) {
  const fail = (what, detail) => out.failures.push({ what, detail: String(detail).slice(0, 300) });
  const note = (k, v) => { out[k] = v; };

  let tab;
  try {
    tab = (await c.call('tab_open', { url: 'about:blank', profile: 'suite', wait: false })).tab;
  } catch (e) { fail('tab_open', e.message); return; }
  out.tabId = tab.id;

  // --- load
  const t0 = Date.now();
  try {
    await c.call('navigate', { tabId: tab.id, url: site.url }, 90000);
  } catch (e) { fail('navigate', e.message); }
  note('loadMs', Date.now() - t0);
  await sleep(site.settle || 5000);

  // --- health
  let health = null;
  try {
    health = (await c.call('eval_js', { tabId: tab.id, code: HEALTH })).value;
    note('health', health);
  } catch (e) { fail('eval_js health', e.message); }

  // Decide early whether the site answered us at all.
  let bodyText = '';
  try { bodyText = (await c.call('eval_js', { tabId: tab.id, code: '(document.body && document.body.innerText || "").slice(0, 2000)' })).value || ''; } catch (_) {}
  const blockedBy = looksBlocked(bodyText, health?.title);
  if (blockedBy || (health && health.textChars < 60 && !health.title)) {
    out.skipped = blockedBy ? `bot wall / access block (${blockedBy})` : 'served an empty page';
    try { await c.call('tab_close', { tabId: tab.id }); } catch (_) {}
    return;
  }

  if (health) {
    if (health.textChars < 200) fail('page rendered almost no text', `${health.textChars} chars, title "${health.title}"`);
    if (health.visibleElements < 5) fail('almost nothing visible', `${health.visibleElements} visible elements`);
    if (health.scrollHeight < 200) fail('page has no height', `scrollHeight ${health.scrollHeight}`);
  }

  // --- page_text
  try {
    const text = await c.call('page_text', { tabId: tab.id, maxChars: 4000 });
    note('textChars', text.chars);
    if (!text.text || text.text.length < 100) fail('page_text returned almost nothing', `${text.chars} chars`);
    else if (site.expect && !text.text.toLowerCase().includes(site.expect.toLowerCase())
             && !(text.title || '').toLowerCase().includes(site.expect.toLowerCase())) {
      fail('expected text missing', `looked for "${site.expect}"; title "${text.title}"`);
    }
  } catch (e) { fail('page_text', e.message); }

  // --- page_read
  try {
    const read = await c.call('page_read', { tabId: tab.id, maxItems: 120 }, 40000);
    note('elements', read.count);
    if (read.count < 3) fail('page_read found almost no elements', `${read.count}`);
    const withRefs = read.elements.filter((e) => e.ref).length;
    if (withRefs !== read.count) fail('some elements came back without a ref', `${withRefs}/${read.count}`);
    out.firstRef = read.elements.find((e) => e.role === 'link' && e.text)?.ref || read.elements[0]?.ref;
  } catch (e) { fail('page_read', e.message); }

  // --- find
  try {
    const q = site.expect || 'a';
    const found = await c.call('find', { tabId: tab.id, query: q, maxItems: 5 }, 40000);
    note('found', found.count);
  } catch (e) { fail('find', e.message); }

  // --- scroll
  try {
    const bottom = await c.call('scroll', { tabId: tab.id, to: 'bottom' });
    if (bottom.scrollY === 0 && (health?.scrollHeight || 0) > 1200) fail('scroll did not move', JSON.stringify(bottom));
    await c.call('scroll', { tabId: tab.id, to: 'top' });
  } catch (e) { fail('scroll', e.message); }

  // --- hover + screenshot
  try {
    const shot = await c.call('screenshot', { tabId: tab.id, maxWidth: 800 });
    if (!shot.base64 || shot.base64.length < 2000) fail('screenshot came back tiny', `${shot.base64?.length} b64 chars`);
    if (SHOT) fs.writeFileSync(path.join(ROOT, '.runtime', `site-${site.key}.jpg`), Buffer.from(shot.base64, 'base64'));
  } catch (e) { fail('screenshot', e.message); }

  // --- our own console errors (the page's own errors are its business, not ours)
  try {
    const con = await c.call('console_read', { tabId: tab.id, pattern: 'claude-browser' });
    const errs = con.messages.filter((m) => /error|warn/i.test(m.level));
    note('ourConsole', con.messages.map((m) => m.message.replace('[claude-browser] ', '')));
    if (errs.length) fail('claude-browser logged an error on this page', errs.map((m) => m.message).join(' | '));
  } catch (e) { fail('console_read', e.message); }

  // --- blocking and scriptlets
  try {
    const t = (await c.call('tabs_list')).tabs.find((x) => x.id === tab.id);
    note('blocked', t.blockedCount);
    note('scriptlets', t.scriptletCount);
    note('scriptletFailures', t.scriptletFailures);
    if (t.scriptletFailures > 0) fail('scriptlets threw on this page', `${t.scriptletFailures} of ${t.scriptletCount}`);
  } catch (e) { fail('tabs_list', e.message); }

  // --- typing, where the site gives us a search box
  if (site.search) {
    try {
      const typed = await c.call('type', { tabId: tab.id, selector: site.search, text: 'test query', clear: true });
      if (typed.fieldValue !== 'test query') fail('typing did not land in the field', JSON.stringify(typed.fieldValue));
    } catch (e) { fail('type', e.message); }
  }

  try { await c.call('tab_close', { tabId: tab.id }); } catch (_) {}
}

// ---------------------------------------------------------------- run
(async () => {
  try { fs.unlinkSync(CONTROL); } catch (_) {}
  const electron = require('electron');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const asRoot = process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0;
  const needXvfb = !process.env.DISPLAY && process.platform === 'linux';
  const extra = [
    ...(asRoot ? ['--no-sandbox', '--disable-gpu'] : []),
    ...(proxy ? [`--proxy-server=${proxy}`, '--ignore-certificate-errors'] : []),
  ];
  const child = spawn(
    needXvfb ? 'xvfb-run' : electron,
    needXvfb ? ['-a', '-s', '-screen 0 1440x900x24', electron, '.', ...extra] : ['.', ...extra],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, CB_ALLOW_MULTIPLE: '1' } },
  );
  let appLog = '';
  child.stdout.on('data', (d) => { appLog += d; });
  child.stderr.on('data', (d) => { appLog += d; });

  let info = null;
  for (let i = 0; i < 150 && !info; i++) { await sleep(400); try { info = JSON.parse(fs.readFileSync(CONTROL, 'utf8')); } catch (_) {} }
  if (!info) { console.error('browser never started\n' + appLog.slice(-2000)); process.exit(250); }
  const c = await new Client(info).connect();

  const st = await c.call('status');
  console.log(`claude-browser ${st.version} · electron ${st.electron} · adblock ${st.adblock.ready ? st.adblock.lists : 'NOT READY'} · ${st.adblock.scriptlets} scriptlets\n`);

  const sites = ONLY ? SITES.filter((s) => s.key.includes(ONLY)) : SITES;
  const results = [];
  for (const site of sites) {
    const out = { key: site.key, url: site.url, failures: [] };
    const t = Date.now();
    try { await checkSite(c, site, out); }
    catch (e) { out.failures.push({ what: 'suite threw', detail: String(e.message) }); }
    out.totalMs = Date.now() - t;
    results.push(out);
    if (out.skipped) {
      console.log(`skip ${site.key.padEnd(14)} ${out.skipped}`);
      continue;
    }
    const mark = out.failures.length ? 'FAIL' : ' ok ';
    console.log(`${mark} ${site.key.padEnd(14)} ${String(out.loadMs || '-').padStart(6)}ms  text ${String(out.textChars || 0).padStart(6)}  els ${String(out.elements || 0).padStart(4)}  blocked ${String(out.blocked ?? 0).padStart(3)}  scriptlets ${String(out.scriptlets ?? 0).padStart(3)}`);
    for (const f of out.failures) console.log(`       ${f.what}: ${f.detail}`);
  }

  const skipped = results.filter((r) => r.skipped);
  const tested = results.filter((r) => !r.skipped);
  const bad = tested.filter((r) => r.failures.length);
  console.log(`\n${tested.length - bad.length}/${tested.length} tested sites clean`
    + (skipped.length ? `, ${skipped.length} skipped (this machine cannot reach them): ${skipped.map((r) => r.key).join(', ')}` : ''));
  if (bad.length) {
    console.log('\nfailing sites:');
    for (const r of bad) console.log(`  ${r.key}: ${r.failures.map((f) => f.what).join('; ')}`);
  }
  fs.writeFileSync(path.join(ROOT, '.runtime', 'site-suite.json'), JSON.stringify(results, null, 2));
  console.log('\nfull detail in .runtime/site-suite.json');

  if (!KEEP) {
    for (const sig of ['SIGTERM', 'SIGKILL']) {
      try { process.kill(-child.pid, sig); } catch (_) { try { child.kill(sig); } catch (_) {} }
    }
  }
  process.exit(Math.min(bad.length, 250));
})();
