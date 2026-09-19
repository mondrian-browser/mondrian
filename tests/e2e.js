'use strict';
// End-to-end check: launches the browser, drives it over the control socket the
// way the MCP bridge does, and asserts on what comes back.
//   node tests/e2e.js            (uses xvfb-run automatically when there is no display)
//   node tests/e2e.js --keep     (leave the browser running afterwards)

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const CONTROL = path.join(ROOT, '.runtime', 'control.json');
const KEEP = process.argv.includes('--keep');

let passed = 0, failed = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { passed++; results.push(`  ok   ${name}`); }
  else { failed++; results.push(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- fixture server
function startFixture() {
  const html = fs.readFileSync(path.join(__dirname, 'fixture.html'));
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/slow')) { setTimeout(() => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1 id=slow>slow page</h1>'); }, 600); return; }
    if (req.url.startsWith('/blocked.js')) { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end('window.__blockedLoaded = true;'); return; }
    if (req.url.startsWith('/second')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>Second page</h1><p>SECOND_MARKER</p>'); return; }
    if (req.url.startsWith('/denyframe')) {
      res.writeHead(200, { 'content-type': 'text/html', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" });
      // If this document renders at all, it says so to its parent. That is the only
      // unambiguous proof the frame was allowed; console wording varies by platform.
      res.end('<h1 id="denied">Refuses to be framed</h1><script>try{parent.postMessage("denyframe-rendered","*")}catch(e){}</script>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

// ---------------------------------------------------------------- control client
class Client {
  constructor(info) { this.info = info; this.seq = 0; this.pending = new Map(); this.events = []; }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${this.info.host}:${this.info.port}`);
      const t = setTimeout(() => reject(new Error('timeout')), 5000);
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
  call(cmd, args = {}, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const id = `x${++this.seq}`;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, cmd, args }));
    });
  }
}

// ---------------------------------------------------------------- run
(async () => {
  const { server, port: fixturePort } = await startFixture();
  const base = `http://127.0.0.1:${fixturePort}`;
  console.log(`fixture on ${base}`);

  // A rule set aimed at the fixture, written before launch so it loads at boot.
  const testRule = {
    title: 'e2e fixture rule',
    enabled: true,
    match: [`*://127.0.0.1:${fixturePort}/*`],
    block: [`*://127.0.0.1:${fixturePort}/blocked.js*`],
    css: '.noisy { display: none !important; }',
    js: 'document.documentElement.setAttribute("data-rule-ran", reason);',
    options: {},
  };
  fs.mkdirSync(path.join(ROOT, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'rules', 'e2e.json'), JSON.stringify(testRule, null, 2));

  try { fs.unlinkSync(CONTROL); } catch (_) {}

  const electron = require('electron');
  const needXvfb = !process.env.DISPLAY && process.platform === 'linux';
  const asRoot = process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0;
  const extra = asRoot ? ['--no-sandbox', '--disable-gpu'] : [];
  const cmd = needXvfb ? 'xvfb-run' : electron;
  const args = needXvfb ? ['-a', '-s', '-screen 0 1440x900x24', electron, '.', ...extra] : ['.', ...extra];
  console.log(`launching electron${needXvfb ? ' under xvfb' : ''}…`);
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, CB_ANNOUNCE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let appLog = '';
  child.stdout.on('data', (d) => { appLog += d; });
  child.stderr.on('data', (d) => { appLog += d; });
  child.on('exit', (code) => { if (code !== 0 && !KEEP) console.log(`electron exited ${code}`); });

  let info = null;
  for (let i = 0; i < 100 && !info; i++) {
    await sleep(400);
    try { info = JSON.parse(fs.readFileSync(CONTROL, 'utf8')); } catch (_) {}
  }
  if (!info) { console.error('browser never wrote control.json\n' + appLog); process.exit(1); }

  const c = await new Client(info).connect();
  console.log('connected\n');

  try {
    // ---- status
    const st = await c.call('status');
    check('status returns version and port', !!st.version && st.control.port === info.port, JSON.stringify(st).slice(0, 200));
    check('status lists rule sets', st.rules.some((r) => r.name === 'e2e'), st.rules.map((r) => r.name).join(','));
    check('boot tab exists', st.tabs.length >= 1);

    // ---- tabs + navigation
    const opened = await c.call('tab_open', { url: base, profile: 'claude' });
    const tabId = opened.tab.id;
    check('tab_open loads the fixture', opened.tab.url.startsWith(base), opened.tab.url);
    check('tab_open honours the profile', opened.tab.profile === 'claude', opened.tab.profile);

    const list = await c.call('tabs_list');
    check('tabs_list marks the active tab', list.tabs.find((t) => t.id === tabId)?.active === true);

    // ---- reading
    const text = await c.call('page_text', { tabId });
    check('page_text returns page prose', text.text.includes('PINEAPPLE_MARKER'), text.text.slice(0, 120));

    const read = await c.call('page_read', { tabId });
    const helloEl = read.elements.find((e) => e.text === 'Say hello');
    check('page_read finds the button with a ref', !!helloEl?.ref, JSON.stringify(read.elements.slice(0, 5)));
    check('page_read reports roles', helloEl?.role === 'button', helloEl?.role);

    const found = await c.call('find', { tabId, query: 'say hello' });
    check('find locates by visible text', found.elements.length > 0 && found.elements[0].text.includes('Say hello'), JSON.stringify(found.elements[0]));

    // ---- rules applied
    const ruleRan = await c.call('eval_js', { tabId, code: 'document.documentElement.getAttribute("data-rule-ran")' });
    check('rule js ran at document-start', !!ruleRan.value, JSON.stringify(ruleRan));
    const noisyHidden = await c.call('eval_js', { tabId, code: 'getComputedStyle(document.querySelector(".noisy")).display' });
    check('rule css hid the noisy block', noisyHidden.value === 'none', noisyHidden.value);

    // ---- acting
    await c.call('type', { tabId, ref: read.elements.find((e) => e.role === 'text')?.ref || undefined, selector: '#name', text: 'Lloyd', clear: true });
    const nameVal = await c.call('eval_js', { tabId, code: 'document.getElementById("name").value' });
    check('type puts text in the field', nameVal.value === 'Lloyd', nameVal.value);

    await c.call('click', { tabId, ref: helloEl.ref });
    const out = await c.call('eval_js', { tabId, code: 'document.getElementById("out").textContent' });
    check('click fires the page handler', out.value === 'clicked:Lloyd', out.value);

    await c.call('select_option', { tabId, selector: '#pick', label: 'Gamma' });
    const picked = await c.call('eval_js', { tabId, code: 'document.getElementById("out").textContent' });
    check('select_option changes the select', picked.value === 'picked:c', picked.value);

    const scrolled = await c.call('scroll', { tabId, to: 'bottom' });
    check('scroll reaches the bottom', scrolled.scrollY > 500, JSON.stringify(scrolled));
    await c.call('scroll', { tabId, to: 'top' });

    await c.call('press_key', { tabId, key: 'End' });

    // ---- console + network
    const con = await c.call('console_read', { tabId });
    check('console_read captures page logs', con.messages.some((m) => /fixture (loaded|button clicked)/.test(m.message)), JSON.stringify(con.messages.slice(0, 4)));

    await c.call('eval_js', { tabId, code: 'fetch("/blocked.js").then(()=>1).catch(()=>0)' });
    await sleep(400);
    const net = await c.call('network_read', { tabId, pattern: 'blocked' });
    check('blocked request was stopped', net.requests.some((r) => r.blocked || r.error), JSON.stringify(net.requests));

    // ---- screenshot
    const shot = await c.call('screenshot', { tabId, maxWidth: 600 });
    check('screenshot returns an image', shot.base64.length > 2000 && shot.width <= 600, `${shot.width}x${shot.height} ${shot.base64.length}b`);
    const elShot = await c.call('screenshot', { tabId, selector: '#hello' });
    check('element screenshot is small', elShot.base64.length > 100 && elShot.height < 120, `${elShot.width}x${elShot.height}`);

    // ---- wait_for
    await c.call('navigate', { tabId, url: `${base}/slow`, wait: false });
    const waited = await c.call('wait_for', { tabId, selector: '#slow', timeoutMs: 8000 });
    check('wait_for waits for a selector', waited.met === 'selector', JSON.stringify(waited));

    // ---- history
    const back = await c.call('history', { tabId, action: 'back' });
    check('history back returns to the fixture', back.tab.url.startsWith(base) && !back.tab.url.includes('/slow'), back.tab.url);

    // ---- rules API
    const setRule = await c.call('rules_set', { name: 'e2e-live', rule: { title: 'live', enabled: true, match: [`*://127.0.0.1:${fixturePort}/*`], css: 'h1 { color: rgb(1, 2, 3) !important }' } });
    check('rules_set saves a rule set', setRule.saved.name === 'e2e-live', JSON.stringify(setRule));
    await c.call('navigate', { tabId, url: base });
    const h1 = await c.call('eval_js', { tabId, code: 'getComputedStyle(document.querySelector("h1")).color' });
    check('a newly written rule applies on next load', h1.value === 'rgb(1, 2, 3)', h1.value);

    await c.call('rules_toggle', { name: 'e2e-live', enabled: false });
    await c.call('navigate', { tabId, url: base });
    const h1b = await c.call('eval_js', { tabId, code: 'getComputedStyle(document.querySelector("h1")).color' });
    check('a disabled rule stops applying', h1b.value !== 'rgb(1, 2, 3)', h1b.value);

    // ---- composed pages
    const composed = await c.call('page_create', {
      name: 'e2e-compose',
      html: `<!doctype html><html><head><title>Composed</title>
        <script>window.__framed = false;
          addEventListener('message', (e) => { if (e.data === 'denyframe-rendered') window.__framed = true; });
        </script></head><body>
        <h1 id="composed">Composed page</h1>
        <iframe id="frame" src="${base}/second" width="400" height="200"></iframe>
        <iframe id="deny" src="${base}/denyframe" width="400" height="200"></iframe>
      </body></html>`,
      profile: 'claude',
    });
    check('page_create writes and opens a page', composed.url.startsWith('file://') && composed.tab?.url.startsWith('file://'), JSON.stringify(composed).slice(0, 200));
    await sleep(1400);
    const composedText = await c.call('page_text', { tabId: composed.tab.id });
    check('composed page is readable', composedText.text.includes('Composed page'), composedText.text.slice(0, 120));
    const frameCount = await c.call('eval_js', { tabId: composed.tab.id, code: 'window.frames.length' });
    check('composed page frames a normal page', frameCount.value >= 2, JSON.stringify(frameCount));
    // The framed document reports in only if it actually rendered.
    const framedOk = await c.call('eval_js', { tabId: composed.tab.id, code: 'window.__framed' });
    check('composed page may frame a site that sends X-Frame-Options: DENY', framedOk.value === true,
      `__framed=${framedOk.value}; composed url=${composed.url}`);

    // …and the same site is still refused when a NORMAL page tries to frame it.
    await c.call('navigate', { tabId, url: base });
    await c.call('eval_js', { tabId, code: 'window.postMessage("frame-me", "*")' });
    await sleep(1500);
    const normalFramed = await c.call('eval_js', { tabId, code: 'window.__framed' });
    check('a normal page is still refused framing (header stripping is scoped)', normalFramed.value === false,
      `__framed=${normalFramed.value} — a normal page rendered a DENY frame, the scope is leaking`);
    const pageList = await c.call('page_list');
    check('page_list finds it', pageList.pages.some((p) => p.name === 'e2e-compose'));
    const src = await c.call('page_read_source', { name: 'e2e-compose' });
    check('page_read_source returns the html', src.html.includes('<h1 id="composed">'));
    await c.call('tab_close', { tabId: composed.tab.id });
    await c.call('page_delete', { name: 'e2e-compose' });

    // ---- profiles
    const profs = await c.call('profiles_list');
    check('profiles_list shows the claude profile in use', profs.profiles.find((p) => p.name === 'claude')?.openTabs >= 1, JSON.stringify(profs));

    // cookie isolation between profiles
    await c.call('eval_js', { tabId, code: 'document.cookie = "cbtest=claude; path=/"' });
    const other = await c.call('tab_open', { url: base, profile: 'lloyd' });
    const otherCookie = await c.call('eval_js', { tabId: other.tab.id, code: 'document.cookie' });
    check('profiles do not share cookies', !String(otherCookie.value).includes('cbtest'), otherCookie.value);
    await c.call('tab_close', { tabId: other.tab.id });

    // ---- browser UI
    const uiCss = await c.call('ui_css', { id: 'e2e', css: '#omnibox { letter-spacing: 0.5px }' });
    check('ui_css injects into the chrome', uiCss.bytes > 0);
    const uiVal = await c.call('ui_eval', { code: 'document.getElementById("injected-css").textContent.includes("letter-spacing")' });
    check('injected chrome css is present in the DOM', uiVal.value === true, JSON.stringify(uiVal));

    await c.call('ui_note', { text: 'e2e run in progress', level: 'success' });
    const noteShown = await c.call('ui_eval', { code: 'document.querySelectorAll("#notes li").length' });
    check('ui_note appears in the activity panel', noteShown.value >= 1, JSON.stringify(noteShown));

    const themes = await c.call('theme_list');
    check('theme_list finds the bundled themes', themes.themes.includes('default') && themes.themes.includes('paper'), JSON.stringify(themes));
    await c.call('theme_set', { name: 'paper' });
    const themed = await c.call('ui_eval', { code: 'document.getElementById("theme-css").textContent.includes("--bg")' });
    check('theme_set swaps the chrome theme', themed.value === true);
    await c.call('theme_set', { name: 'default' });

    await c.call('ui_panel', { open: true });
    const panelOpen = await c.call('ui_eval', { code: '!document.getElementById("panel").hidden' });
    check('ui_panel opens the side panel', panelOpen.value === true);
    await c.call('ui_panel', { open: false });

    // the chrome UI renders tabs
    const tabCount = await c.call('ui_eval', { code: 'document.querySelectorAll("#tabs .tab").length' });
    check('chrome UI renders a tab strip', tabCount.value >= 2, JSON.stringify(tabCount));

    // ---- window
    const w = await c.call('window', { action: 'setBounds', bounds: { width: 1100, height: 780 } });
    check('window bounds can be set', Math.abs(w.bounds.width - 1100) <= 2, JSON.stringify(w.bounds));

    // ---- events reached listeners
    check('control socket broadcast events', c.events.length > 0, `${c.events.length} events`);

    // ---- error shape
    let errMsg = '';
    try { await c.call('click', { tabId, ref: 'e99999' }); } catch (e) { errMsg = e.message; }
    check('a stale ref gives a useful error', /Unknown ref/.test(errMsg), errMsg);

    // ---- cleanup
    await c.call('tab_close', { tabId });
  } catch (e) {
    failed++;
    results.push(`  FAIL harness threw — ${e.stack || e.message}`);
  }

  console.log(results.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed && appLog) console.log('\n--- app log ---\n' + appLog.slice(-4000));

  try { fs.unlinkSync(path.join(ROOT, 'rules', 'e2e.json')); } catch (_) {}
  try { fs.unlinkSync(path.join(ROOT, 'rules', 'e2e-live.json')); } catch (_) {}
  server.close();
  if (!KEEP) { try { process.kill(-child.pid); } catch (_) { try { child.kill('SIGKILL'); } catch (_) {} } }
  process.exit(failed ? 1 : 0);
})();
