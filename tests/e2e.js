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

// Wait for a condition instead of guessing a duration. The blocked-count broadcast is
// throttled, so a fixed sleep races it and the test fails perhaps one run in three.
async function until(fn, { timeoutMs = 8000, everyMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { last = await fn(); if (last) return last; } catch (e) { last = undefined; }
    await sleep(everyMs);
  }
  return last;
}

function shutdown(child) {
  if (!child) return;
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    try { process.kill(-child.pid, signal); } catch (_) { try { child.kill(signal); } catch (_) {} }
  }
}

// ---------------------------------------------------------------- fixture server
function startFixture() {
  const html = fs.readFileSync(path.join(__dirname, 'fixture.html'));
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/slow')) { setTimeout(() => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1 id=slow>slow page</h1>'); }, 600); return; }
    if (req.url.startsWith('/blocked.js')) { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end('window.__blockedLoaded = true;'); return; }
    if (req.url.startsWith('/adtest.js')) { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end('window.__adLoaded = true;'); return; }
    if (req.url.startsWith('/noeval')) {
      // script-src without 'unsafe-eval', which is what YouTube sends. The preload's
      // own world inherits this, so new Function() is refused here.
      res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "script-src 'self' 'unsafe-inline'" });
      res.end('<!doctype html><html><head><title>No eval</title></head><body><h1 id="noeval">no eval</h1><div class="target">target</div></body></html>');
      return;
    }
    if (req.url.startsWith('/csp')) {
      // A page that refuses inline scripts, to prove main-world injection is not
      // going through an injected <script> element.
      res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "script-src 'self'" });
      res.end('<!doctype html><html><head></head><body><h1 id="csp">CSP page</h1></body></html>');
      return;
    }
    if (req.url.startsWith('/mainworld')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      // The page records whether the injected global was already there when it ran.
      res.end(`<!doctype html><html><head><script>
        window.__pageRanAt = Date.now();
        window.__sawInjected = (typeof window.__injectedEarly !== 'undefined');
        window.__siteApi = function () { return 'original'; };
      </script></head><body><h1 id="mw">main world</h1></body></html>`);
      return;
    }
    if (req.url.startsWith('/form')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html><head><title>Form page</title></head><body>
        <h1>Form page</h1>
        <!-- A submit button, because HTML only does implicit submission when a form
             has one, or has exactly one field that blocks it. Two bare inputs and no
             button means Chromium is right to ignore Enter. -->
        <form id="f" action="/second" method="get">
          <input id="q" name="q" type="search" placeholder="Query">
          <input id="second" name="second" type="text">
          <button id="go" type="submit">Go</button>
        </form>
        <form id="single" action="/second" method="get">
          <input id="lonely" name="lonely" type="text">
        </form>
        <div id="log">no submit</div>
        <script>
          document.getElementById('f').addEventListener('submit', () => { document.getElementById('log').textContent = 'submitted'; });
        </script>
      </body></html>`);
      return;
    }
    if (req.url.startsWith('/swap')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html><head><title>Swap page</title></head><body>
        <h1>Swap page</h1>
        <div id="holder"><input id="live" name="q" placeholder="Search here"></div>
        <script>
          // Replace the node on first focus, exactly what Wikipedia's search box does.
          document.getElementById('live').addEventListener('focus', function once() {
            const old = document.getElementById('live');
            const fresh = document.createElement('input');
            fresh.id = 'live'; fresh.name = 'q'; fresh.placeholder = 'Search here';
            fresh.setAttribute('data-swapped', 'yes');
            old.replaceWith(fresh);
            fresh.focus();
          }, { once: true });
        </script>
      </body></html>`);
      return;
    }
    if (req.url.startsWith('/shadow')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html><head><title>Shadow page</title></head><body>
        <div id="host"></div>
        <script>
          // Two levels deep, the way a web-component site nests them.
          const outer = document.getElementById('host').attachShadow({ mode: 'open' });
          outer.innerHTML = '<h1>Outer shadow heading</h1><div id="inner"></div>';
          const inner = outer.querySelector('#inner').attachShadow({ mode: 'open' });
          inner.innerHTML = '<p>SHADOW_MARKER deep inside a nested shadow root, where innerText cannot reach it.</p><a href="/second" id="shadowlink">Shadow link</a>';
        </script>
      </body></html>`);
      return;
    }
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

// A port nothing is listening on, so a navigation to it is refused immediately and
// offline. Bind an ephemeral port, note it, hand it back.
function closedPort() {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

// ---------------------------------------------------------------- launching the app
// detached gives the child its own process group. Without it, killing -pid does
// nothing and xvfb-run leaves an orphaned Electron holding a control port; twenty
// of those and the next run cannot start at all.
function spawnApp(extraArgs = []) {
  const electron = require('electron');
  const needXvfb = !process.env.DISPLAY && process.platform === 'linux';
  // --no-sandbox has to arrive as an argv flag: appendSwitch inside main.js runs after
  // the SUID check (gotcha 8), so main.js's own Linux no-sandbox line never takes
  // effect. It used to be passed only when running as root, which meant every Linux
  // machine that is not root — including every GitHub runner — aborted before boot
  // with "The SUID sandbox helper binary was found, but is not configured correctly",
  // and the suite reported "browser never wrote control.json". npm cannot set the
  // setuid bit on node_modules/electron/dist/chrome-sandbox as a normal user, and the
  // runners restrict unprivileged user namespaces, so there is no namespace sandbox to
  // fall back on either. main.js already intends no sandbox on Linux; the harness now
  // agrees with it instead of only agreeing when it happens to be root.
  const isLinux = process.platform === 'linux';
  const asRoot = isLinux && typeof process.getuid === 'function' && process.getuid() === 0;
  const extra = [...(isLinux ? ['--no-sandbox'] : []), ...(asRoot ? ['--disable-gpu'] : [])];
  const cmd = needXvfb ? 'xvfb-run' : electron;
  const args = needXvfb
    ? ['-a', '-s', '-screen 0 1440x900x24', electron, '.', ...extra, ...extraArgs]
    : ['.', ...extra, ...extraArgs];
  console.log(`launching electron${needXvfb ? ' under xvfb' : ''}${extraArgs.length ? ' ' + extraArgs.join(' ') : ''}…`);
  try { fs.unlinkSync(CONTROL); } catch (_) {}
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, CB_ANNOUNCE: '1', CB_ALLOW_MULTIPLE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const box = { text: '', exited: false };
  child.stdout.on('data', (d) => { box.text += d; });
  child.stderr.on('data', (d) => { box.text += d; });
  child.on('exit', (code) => {
    box.exited = true;
    if (code !== 0 && !KEEP) console.log(`electron exited ${code}`);
  });
  return { child, box };
}

// Wait for the process itself, not for its control.json to disappear. An instance
// unlinks that file from its own will-quit handler, so a slow exit can delete the
// *next* instance's file after it has been written — the suite would then sit there
// reporting "browser never wrote control.json" against a browser that had started
// perfectly. Only matters when one run launches twice, which is why it appears here
// and not in the older single-launch suites.
async function waitForExit(app, timeoutMs = 15000) {
  shutdown(app.child);
  return until(() => app.box.exited, { timeoutMs, everyMs: 100 });
}

// control.json appearing is the app's own signal that commands are safe to send.
// spawnApp deletes it first, so what turns up here is always this instance's.
async function waitForControl(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return JSON.parse(fs.readFileSync(CONTROL, 'utf8')); } catch (_) {}
    await sleep(400);
  }
  return null;
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

  // ---- boot survives a start page that will not load
  // The home page lives on the network and the network is not always there. Until
  // 20 Sep 2026 a start page that failed to load rejected out of boot() and took
  // app.exit(1) with it: no window, no control socket, no omnibox to type a working
  // URL into. Offline, behind a captive portal, or behind a proxy that refuses
  // CONNECT, Mondrian would not start at all — and this suite, which is documented
  // as hermetic, could not run either, because it booted to the configured homeUrl.
  // The positive case is here; the negative case is three checks below, where a
  // start page that does load has to still be loaded and still be error-free.
  const deadUrl = `http://127.0.0.1:${await closedPort()}/`;
  const dead = spawnApp([`--url=${deadUrl}`]);
  const deadInfo = await waitForControl();
  check('an unreachable start page still boots the browser', !!deadInfo, dead.box.text.slice(-400));
  if (deadInfo) {
    const dc = await new Client(deadInfo).connect();
    const dst = await dc.call('status');
    check('the control socket comes up after a failed start page', !!dst.control.port && dst.tabs.length >= 1, JSON.stringify(dst.control));
    check('the failed start page is recorded, not swallowed',
      dst.tabs[0]?.lastError?.url === deadUrl, JSON.stringify(dst.tabs[0]?.lastError));
    const recovered = await dc.call('navigate', { url: base });
    check('the browser can navigate away from a failed start page', recovered.tab.url.startsWith(base), recovered.tab.url);
  }
  check('the browser with a failed start page shuts down cleanly', await waitForExit(dead), dead.box.text.slice(-300));

  // The rest of the suite boots straight to the fixture. Booting to settings.homeUrl
  // put duckduckgo.com on the critical path of all 86 hermetic checks.
  const { child, box } = spawnApp([`--url=${base}`]);
  const appLogOf = () => box.text;
  const info = await waitForControl();
  if (!info) { console.error('browser never wrote control.json\n' + appLogOf()); shutdown(child); process.exit(1); }

  const c = await new Client(info).connect();
  console.log('connected\n');

  try {
    // ---- status
    const st = await c.call('status');
    check('status returns version and port', !!st.version && st.control.port === info.port, JSON.stringify(st).slice(0, 200));
    check('status lists rule sets', st.rules.some((r) => r.name === 'e2e'), st.rules.map((r) => r.name).join(','));
    check('boot tab exists', st.tabs.length >= 1);
    // The negative case for the boot-resilience fix above: catching the failure must
    // not turn into boot quietly skipping the navigation altogether.
    check('boot loads the start page it was given', st.tabs[0]?.url.startsWith(base), st.tabs[0]?.url);
    check('a start page that loads records no error', !st.tabs[0]?.lastError, JSON.stringify(st.tabs[0]?.lastError));

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
    // A tiny <article> near the top used to win the root election and page_text would
    // return only its text. Reddit does exactly this.
    check('page_text ignores a near-empty landmark and reads the page',
      text.chars > 200 && !/^\s*Sponsored\s*$/.test(text.text), `${text.chars} chars: ${text.text.slice(0, 60)}`);
    const scoped = await c.call('page_text', { tabId, selector: '#decoy-landmark' });
    check('page_text still honours an explicit selector', scoped.text.trim() === 'Sponsored', JSON.stringify(scoped.text));

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

    // ---- ad blocking (custom filters, so this is deterministic and needs no network)
    const abStatus = await c.call('adblock_status');
    check('adblock reports ready', abStatus.ready === true && abStatus.enabled === true, JSON.stringify(abStatus).slice(0, 200));

    await c.call('navigate', { tabId, url: base });
    const adBefore = await c.call('eval_js', { tabId, code: 'window.__adLoaded === true' });
    check('the ad script loads before any filter matches it', adBefore.value === true, JSON.stringify(adBefore));

    await c.call('adblock_set', { customFilters: ['/adtest.js', '127.0.0.1##.sponsored-thing'] });
    await c.call('navigate', { tabId, url: base });
    const adAfter = await c.call('eval_js', { tabId, code: 'window.__adLoaded === true' });
    check('a custom network filter blocks the request', adAfter.value === false, JSON.stringify(adAfter));
    const cosmetic = await c.call('eval_js', { tabId, code: 'getComputedStyle(document.querySelector(".sponsored-thing")).display' });
    check('a custom cosmetic filter hides the element', cosmetic.value === 'none', cosmetic.value);

    await c.call('adblock_set', { allowlist: ['127.0.0.1'] });
    await c.call('navigate', { tabId, url: base });
    const allowed = await c.call('eval_js', { tabId, code: 'window.__adLoaded === true' });
    check('the allowlist turns blocking off for that site', allowed.value === true, JSON.stringify(allowed));
    const cosmeticOff = await c.call('eval_js', { tabId, code: 'getComputedStyle(document.querySelector(".sponsored-thing")).display' });
    check('the allowlist also stops element hiding', cosmeticOff.value !== 'none', cosmeticOff.value);

    await c.call('adblock_set', { enabled: false, customFilters: [], allowlist: [] });
    const abOff = await c.call('adblock_status');
    check('adblock can be switched off', abOff.enabled === false && abOff.customFilters === 0);
    await c.call('adblock_set', { enabled: true });

    // ---- main-world injection (rule mainJs, and the scriptlets that ride the same path)
    await c.call('rules_set', {
      name: 'e2e-mainworld',
      rule: {
        title: 'main world',
        enabled: true,
        match: [`*://127.0.0.1:${fixturePort}/*`],
        // Sets a global BEFORE the page runs, and replaces a function the page defines.
        mainJs: `window.__injectedEarly = 'yes';
                 window.__injectedAt = Date.now();
                 Object.defineProperty(window, '__siteApi', {
                   configurable: true,
                   get() { return function () { return 'replaced'; }; },
                   set() {},
                 });`,
        js: 'window.__isolatedRan = true;',
      },
    });

    await c.call('navigate', { tabId, url: `${base}/mainworld` });
    const mw = await c.call('eval_js', { tabId, code: '({ injected: window.__injectedEarly, sawInjected: window.__sawInjected, api: window.__siteApi && window.__siteApi(), isolatedLeaked: typeof window.__isolatedRan })' });
    check('mainJs reaches the page\'s own world', mw.value.injected === 'yes', JSON.stringify(mw.value));
    check('mainJs runs before the page\'s own scripts', mw.value.sawInjected === true, JSON.stringify(mw.value));
    check('mainJs can replace what the page defines', mw.value.api === 'replaced', JSON.stringify(mw.value));
    check('isolated-world js stays out of the page', mw.value.isolatedLeaked === 'undefined', mw.value.isolatedLeaked);

    await c.call('navigate', { tabId, url: `${base}/csp` });
    const cspInject = await c.call('eval_js', { tabId, code: 'window.__injectedEarly' });
    check('main-world injection survives a strict script-src CSP', cspInject.value === 'yes', JSON.stringify(cspInject));

    await c.call('rules_toggle', { name: 'e2e-mainworld', enabled: false });

    // Filter-list scriptlets use the same channel. set-constant defines a page global,
    // so if it lands, real scriptlets from EasyList land too.
    const abReady = await c.call('adblock_status');
    if (abReady.scriptlets > 0) {
      await c.call('adblock_set', { customFilters: ['127.0.0.1##+js(set-constant, __scriptletProof, true)'] });
      await c.call('navigate', { tabId, url: `${base}/mainworld` });
      const sc = await c.call('eval_js', { tabId, code: 'window.__scriptletProof' });
      check('a filter-list scriptlet executes in the page', sc.value === true, `${JSON.stringify(sc)} (library has ${abReady.scriptlets} scriptlets)`);
      const tabAfter = (await c.call('tabs_list')).tabs.find((t) => t.id === tabId);
      check('scriptlet injections are counted on the tab', tabAfter.scriptletCount >= 1, JSON.stringify(tabAfter?.scriptletCount));
      await c.call('adblock_set', { customFilters: [] });
    } else {
      check('scriptlet library loaded', false, 'engine reported 0 scriptlets, so the list download probably failed');
    }

    // ---- a ref whose node gets replaced is found again, not just refused
    await c.call('navigate', { tabId, url: `${base}/swap` });
    await sleep(500);
    const swapFound = await c.call('find', { tabId, query: 'Search here' });
    check('found the field before it is replaced', swapFound.count > 0, JSON.stringify(swapFound.elements[0]));
    const swapRef = swapFound.elements[0].ref;
    // Focusing swaps the node out, which kills a plain element reference.
    await c.call('click', { tabId, ref: swapRef });
    await sleep(400);
    const wasSwapped = await c.call('eval_js', { tabId, code: 'document.getElementById("live").getAttribute("data-swapped")' });
    check('the page really did replace the node', wasSwapped.value === 'yes', JSON.stringify(wasSwapped.value));
    const typedSwap = await c.call('type', { tabId, ref: swapRef, text: 'still works', clear: true });
    check('the ref survives the node being replaced', typedSwap.fieldValue === 'still works', JSON.stringify(typedSwap));

    // ---- Enter has to actually submit a form
    // Chromium drives implicit submission off the char event. Sending only
    // keyDown/keyUp delivers a trusted Enter that the page sees and nothing happens,
    // which is exactly what Wikipedia's search box did.
    await c.call('navigate', { tabId, url: `${base}/form` });
    await sleep(500);
    await c.call('type', { tabId, selector: '#q', text: 'hello', clear: true });
    await c.call('press_key', { tabId, key: 'Enter' });
    await sleep(1200);
    const submitted = (await c.call('tabs_list')).tabs.find((t) => t.id === tabId);
    check('Enter submits a real form', submitted.url.includes('/second') && submitted.url.includes('q=hello'), submitted.url);

    // and the same through type({submit:true})
    await c.call('navigate', { tabId, url: `${base}/form` });
    await sleep(500);
    await c.call('type', { tabId, selector: '#q', text: 'world', clear: true, submit: true });
    await sleep(1200);
    const submitted2 = (await c.call('tabs_list')).tabs.find((t) => t.id === tabId);
    check('type with submit:true submits too', submitted2.url.includes('q=world'), submitted2.url);

    // A single-field form with no button is the other case HTML allows
    await c.call('navigate', { tabId, url: `${base}/form` });
    await sleep(500);
    await c.call('type', { tabId, selector: '#lonely', text: 'solo', clear: true, submit: true });
    await sleep(1200);
    const solo = (await c.call('tabs_list')).tabs.find((t) => t.id === tabId);
    check('Enter submits a single-field form with no button', solo.url.includes('lonely=solo'), solo.url);

    // Tab moves focus, which also needs the char event
    await c.call('navigate', { tabId, url: `${base}/form` });
    await sleep(500);
    await c.call('click', { tabId, selector: '#q' });
    await c.call('press_key', { tabId, key: 'Tab' });
    await sleep(400);
    const focused = await c.call('eval_js', { tabId, code: 'document.activeElement && document.activeElement.id' });
    check('Tab moves focus to the next field', focused.value === 'second', JSON.stringify(focused.value));

    // ---- shadow DOM: innerText is blind to it, so page_text has to go deeper
    await c.call('navigate', { tabId, url: `${base}/shadow` });
    await sleep(700);
    const plainInner = await c.call('eval_js', { tabId, code: '(document.body.innerText || "").trim().length' });
    check('innerText really does miss shadow content', plainInner.value < 40, `body innerText was ${plainInner.value} chars`);
    const shadowText = await c.call('page_text', { tabId });
    check('page_text reads nested shadow DOM', shadowText.text.includes('SHADOW_MARKER'), `${shadowText.chars} chars: ${shadowText.text.slice(0, 80)}`);
    check('page_text says when it had to go through shadow roots', shadowText.viaShadow === true, JSON.stringify(shadowText.viaShadow));
    const shadowRead = await c.call('page_read', { tabId });
    check('page_read finds elements inside shadow roots', shadowRead.elements.some((e) => e.text === 'Shadow link'), JSON.stringify(shadowRead.elements.slice(0, 5)));
    const shadowFind = await c.call('find', { tabId, query: 'Shadow link' });
    check('find reaches into shadow roots', shadowFind.count > 0, JSON.stringify(shadowFind.elements[0]));
    if (shadowFind.count) {
      await c.call('click', { tabId, ref: shadowFind.elements[0].ref });
      await sleep(900);
      const after = await c.call('tabs_list');
      const t = after.tabs.find((x) => x.id === tabId);
      check('clicking an element inside a shadow root works', t.url.includes('/second'), t.url);
    }

    // ---- main-world code is ONE bundle per set, with each part isolated
    // Injecting a set's scripts as separate calls broke YouTube outright: later calls
    // landed mid-hydration. They go in one bundle now, each part in its own try.
    await c.call('adblock_set', { customFilters: [
      '127.0.0.1##+js(set-constant, __bundleOne, 1)',
      '127.0.0.1##+js(set-constant, __bundleTwo, 2)',
    ] });
    await c.call('navigate', { tabId, url: `${base}/mainworld` });
    await sleep(1200);
    const bundle = await c.call('eval_js', { tabId, code: '({ one: window.__bundleOne, two: window.__bundleTwo })' });
    check('every scriptlet in a set is applied', bundle.value.one === 1 && bundle.value.two === 2, JSON.stringify(bundle.value));
    const bundleTab = (await c.call('tabs_list')).tabs.find((t) => t.id === tabId);
    check('a clean bundle reports no failures', bundleTab.scriptletFailures === 0, JSON.stringify(bundleTab.scriptletFailures));
    await c.call('adblock_set', { customFilters: [] });

    await c.call('rules_set', {
      name: 'e2e-throw',
      rule: {
        title: 'throwing mainJs',
        enabled: true,
        match: [`*://127.0.0.1:${fixturePort}/*`],
        mainJs: 'window.__beforeThrow = true; throw new Error("deliberate"); ',
      },
    });
    await c.call('navigate', { tabId, url: `${base}/mainworld` });
    await sleep(900);
    const threw = await c.call('eval_js', { tabId, code: '({ ran: window.__beforeThrow === true, pageAlive: !!document.querySelector("h1") })' });
    check('a throwing main-world script is caught, not fatal', threw.value.ran === true && threw.value.pageAlive === true, JSON.stringify(threw.value));
    const throwTab = (await c.call('tabs_list')).tabs.find((t) => t.id === tabId);
    check('a throwing main-world script is counted', throwTab.scriptletFailures >= 1, JSON.stringify(throwTab.scriptletFailures));
    await c.call('rules_toggle', { name: 'e2e-throw', enabled: false });

    // scriptlets can be switched off without losing blocking
    await c.call('adblock_set', { customFilters: ['127.0.0.1##+js(set-constant, __offTest, 9)', '/adtest.js'], scriptlets: false });
    await c.call('navigate', { tabId, url: `${base}/mainworld` });
    await sleep(900);
    const noScriptlets = await c.call('eval_js', { tabId, code: 'window.__offTest' });
    check('scriptlets can be turned off on their own', noScriptlets.value === null || noScriptlets.value === undefined, JSON.stringify(noScriptlets));
    await c.call('navigate', { tabId, url: base });
    const stillBlocking = await c.call('eval_js', { tabId, code: 'window.__adLoaded === true' });
    check('turning scriptlets off leaves network blocking on', stillBlocking.value === false, JSON.stringify(stillBlocking));
    await c.call('adblock_set', { customFilters: [], scriptlets: true });

    // ---- rule js under a CSP that forbids eval (the YouTube case)
    await c.call('rules_set', {
      name: 'e2e-noeval',
      rule: {
        title: 'no eval',
        enabled: true,
        match: [`*://127.0.0.1:${fixturePort}/*`],
        js: `var el = document.querySelector('.target');
             if (el) { el.setAttribute('data-rule-touched', reason); el.style.color = 'rgb(4, 5, 6)'; }
             window.__ruleWorldFlag = 'set';`,
        options: { marker: 'opts-arrived' },
      },
    });
    await c.call('navigate', { tabId, url: `${base}/noeval` });
    await sleep(900);
    const noeval = await c.call('eval_js', { tabId, code: `({
      touched: document.querySelector('.target').getAttribute('data-rule-touched'),
      styled: getComputedStyle(document.querySelector('.target')).color,
      leakedToPage: typeof window.__ruleWorldFlag
    })` });
    check('rule js runs on a page whose CSP forbids eval', !!noeval.value.touched, JSON.stringify(noeval.value));
    check('rule js can style the DOM from its isolated world', noeval.value.styled === 'rgb(4, 5, 6)', noeval.value.styled);
    check('rule js stays invisible to the page', noeval.value.leakedToPage === 'undefined', noeval.value.leakedToPage);

    const noevalErrors = await c.call('console_read', { tabId, pattern: 'mondrian' });
    check('no rule errors were logged on the CSP page', noevalErrors.messages.length === 0,
      noevalErrors.messages.map((m) => m.message).join(' | ').slice(0, 250));

    // options and reason reach the rule
    await c.call('rules_set', {
      name: 'e2e-noeval',
      rule: {
        title: 'no eval',
        enabled: true,
        match: [`*://127.0.0.1:${fixturePort}/*`],
        js: `document.documentElement.setAttribute('data-opts', options.marker + '/' + reason);`,
        options: { marker: 'opts-arrived' },
      },
    });
    await c.call('navigate', { tabId, url: `${base}/noeval` });
    await sleep(700);
    const opts = await c.call('eval_js', { tabId, code: 'document.documentElement.getAttribute("data-opts")' });
    check('options and reason are passed into rule js', String(opts.value).startsWith('opts-arrived/'), JSON.stringify(opts));
    await c.call('rules_toggle', { name: 'e2e-noeval', enabled: false });

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
    check('theme_list finds the bundled themes', ['default', 'paper', 'destijl'].every((t) => themes.themes.includes(t)), JSON.stringify(themes));
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

    // the shield reflects blocking state
    await c.call('adblock_set', { customFilters: ['/adtest.js'], allowlist: [] });
    const shieldTab = (await c.call('tab_open', { url: base, profile: 'claude' })).tab;
    const shield = await until(async () => {
      const r = await c.call('ui_eval', { code: '({ count: document.getElementById("blocked-count").textContent, off: document.getElementById("shield").classList.contains("is-off") })' });
      return r.value.count !== '' && r.value.off === false ? r : null;
    });
    check('the shield shows a blocked count for the page', !!shield, 'blocked count never appeared within 8s');
    await c.call('adblock_set', { allowlist: ['127.0.0.1'] });
    await c.call('history', { tabId: shieldTab.id, action: 'reload' });
    const shieldOff = await until(async () => {
      const r = await c.call('ui_eval', { code: 'document.getElementById("shield").classList.contains("is-off")' });
      return r.value === true ? r : null;
    });
    check('the shield dims on an allowlisted site', !!shieldOff, 'shield never dimmed within 8s');
    await c.call('tab_close', { tabId: shieldTab.id });
    await c.call('adblock_set', { customFilters: [], allowlist: [] });

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
  if (failed && appLogOf()) console.log('\n--- app log ---\n' + appLogOf().slice(-4000));

  for (const f of ['e2e.json', 'e2e-live.json', 'e2e-mainworld.json', 'e2e-noeval.json', 'e2e-throw.json']) {
    try { fs.unlinkSync(path.join(ROOT, 'rules', f)); } catch (_) {}
  }
  server.close();
  if (!KEEP) shutdown(child);
  process.exit(failed ? 1 : 0);
})();
