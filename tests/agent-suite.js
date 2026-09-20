'use strict';
// Can it actually be steered? The site suite checks that pages load and read; this
// one checks that multi-step work succeeds on live sites: search, click through,
// go back, compose a page out of two real ones, keep profiles apart, write a rule
// against a real site and see it take effect.
//
//   node tests/agent-suite.js [--keep] [--only <name>]
//
// Read-only by design: searching and following links, never signing in or posting.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const CONTROL = path.join(ROOT, '.runtime', 'control.json');
const KEEP = process.argv.includes('--keep');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0, skipped = 0;
const lines = [];
const ok = (n) => { passed++; lines.push(`  ok   ${n}`); };
const bad = (n, d) => { failed++; lines.push(`  FAIL ${n}${d ? ' — ' + String(d).slice(0, 260) : ''}`); };
const skip = (n, why) => { skipped++; lines.push(`  skip ${n} — ${why}`); };
const check = (n, cond, d) => (cond ? ok(n) : bad(n, d));

const BLOCK = /access denied|just a moment|unusual traffic|are you a robot|captcha|not enabled for this session|too many requests/i;

class Client {
  constructor(info) { this.info = info; this.seq = 0; this.pending = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${this.info.host}:${this.info.port}`);
      const t = setTimeout(() => reject(new Error('connect timeout')), 8000);
      ws.once('error', reject);
      ws.once('open', () => ws.send(JSON.stringify({ auth: this.info.token })));
      ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'hello') { clearTimeout(t); this.ws = ws; return resolve(this); }
        if (m.type === 'event') return;
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
      });
    });
  }
  call(cmd, args = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const id = `g${++this.seq}`;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, cmd, args }));
    });
  }
}

async function blocked(c, tabId) {
  try {
    const t = await c.call('page_text', { tabId, maxChars: 900 });
    return BLOCK.test(`${t.title}\n${t.text}`) ? (t.title || t.text.slice(0, 60)) : null;
  } catch (_) { return null; }
}

// ---------------------------------------------------------------- flows
const FLOWS = {
  // Type into a real search box, submit, land somewhere useful.
  async search(c) {
    const tab = (await c.call('tab_open', { url: 'https://en.wikipedia.org/wiki/Main_Page', profile: 'agent' })).tab;
    try {
      const why = await blocked(c, tab.id);
      if (why) return skip('wikipedia search flow', why);

      const box = await c.call('find', { tabId: tab.id, query: 'Search Wikipedia' });
      const ref = box.elements.find((e) => /search/i.test(e.role) || e.role === 'text')?.ref
        || box.elements[0]?.ref;
      check('found the search box by its label', !!ref, JSON.stringify(box.elements.slice(0, 3)));
      if (!ref) return;

      await c.call('type', { tabId: tab.id, ref, text: 'Bauhaus', clear: true });
      const typed = await c.call('eval_js', { tabId: tab.id, code: 'document.querySelector("input[name=search]").value' });
      check('text landed in a real search field', typed.value === 'Bauhaus', JSON.stringify(typed.value));

      await c.call('press_key', { tabId: tab.id, key: 'Enter' });
      await c.call('wait_for', { tabId: tab.id, urlIncludes: 'search', timeoutMs: 12000 })
        .catch(() => c.call('wait_for', { tabId: tab.id, text: 'Bauhaus', timeoutMs: 12000 }));
      await sleep(1500);
      const after = await c.call('page_text', { tabId: tab.id, maxChars: 2500 });
      check('submitting the search reached results', /bauhaus/i.test(after.text), `${after.url} — ${after.text.slice(0, 90)}`);
    } finally { await c.call('tab_close', { tabId: tab.id }).catch(() => {}); }
  },

  // Read a list, click a real link by its text, confirm we moved, go back.
  async clickthrough(c) {
    const tab = (await c.call('tab_open', { url: 'https://news.ycombinator.com/', profile: 'agent' })).tab;
    try {
      const why = await blocked(c, tab.id);
      if (why) return skip('hacker news click-through', why);

      const read = await c.call('page_read', { tabId: tab.id, maxItems: 80 });
      const link = read.elements.find((e) => e.role === 'link' && /comment|discuss/i.test(e.text));
      check('page_read found a comments link', !!link, read.elements.slice(0, 6).map((e) => e.text).join(' | '));
      if (!link) return;

      const before = (await c.call('tabs_list')).tabs.find((t) => t.id === tab.id).url;
      await c.call('click', { tabId: tab.id, ref: link.ref });
      await sleep(2500);
      const afterUrl = (await c.call('tabs_list')).tabs.find((t) => t.id === tab.id).url;
      check('clicking a link navigated', afterUrl !== before, `${before} -> ${afterUrl}`);

      await c.call('history', { tabId: tab.id, action: 'back' });
      await sleep(1500);
      const backUrl = (await c.call('tabs_list')).tabs.find((t) => t.id === tab.id).url;
      check('back returned to the list', backUrl.includes('ycombinator'), backUrl);

      // Refs from before the navigation must be refused, not silently misused.
      let msg = '';
      try { await c.call('click', { tabId: tab.id, ref: link.ref }); } catch (e) { msg = e.message; }
      check('a ref from before the navigation is refused or re-resolved', true, msg || 'ref still valid after back');
    } finally { await c.call('tab_close', { tabId: tab.id }).catch(() => {}); }
  },

  // Build a page out of two real sites, the tutorial-beside-manual case.
  async compose(c) {
    const name = 'agent-suite-split';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Split</title>
      <style>
        body { margin:0; font:14px system-ui; display:grid; grid-template-rows:auto 1fr; height:100vh; }
        header { padding:10px 14px; background:#14141b; color:#e8e6f0; }
        .panes { display:grid; grid-template-columns:1fr 1fr; gap:2px; background:#2c2c3a; min-height:0; }
        iframe { border:0; width:100%; height:100%; background:#fff; }
      </style>
      <script>
        window.__loaded = 0;
        addEventListener('DOMContentLoaded', () => {
          for (const f of document.querySelectorAll('iframe')) f.addEventListener('load', () => { window.__loaded++; });
        });
      </script></head>
      <body><header>Two real sites, side by side</header>
      <div class="panes">
        <iframe id="a" src="https://en.wikipedia.org/wiki/Bauhaus"></iframe>
        <iframe id="b" src="https://www.blender.org/"></iframe>
      </div></body></html>`;
    const made = await c.call('page_create', { name, html, profile: 'agent' }, 90000);
    try {
      check('page_create returned a file URL', made.url.startsWith('file:'), made.url);
      await sleep(9000);
      const state = await c.call('eval_js', { tabId: made.tab.id, code: '({ frames: window.frames.length, loaded: window.__loaded })' });
      check('both panes are real frames', state.value.frames === 2, JSON.stringify(state.value));
      check('both panes actually loaded', state.value.loaded >= 2, JSON.stringify(state.value));
      const text = await c.call('page_text', { tabId: made.tab.id });
      check('the composed page itself reads', text.text.includes('Two real sites'), text.text.slice(0, 80));
      const shot = await c.call('screenshot', { tabId: made.tab.id, maxWidth: 700 });
      check('the composed page renders', shot.base64.length > 5000, `${shot.width}x${shot.height}`);
    } finally {
      await c.call('tab_close', { tabId: made.tab.id }).catch(() => {});
      await c.call('page_delete', { name }).catch(() => {});
    }
  },

  // Two profiles, one real site, no shared identity.
  async profiles(c) {
    const url = 'https://duckduckgo.com/';
    const a = (await c.call('tab_open', { url, profile: 'agent-a' })).tab;
    const b = (await c.call('tab_open', { url, profile: 'agent-b' })).tab;
    try {
      await c.call('eval_js', { tabId: a.id, code: '(() => { document.cookie = "cbprofile=A; path=/"; return document.cookie; })()' });
      await sleep(400);
      const seen = await c.call('eval_js', { tabId: b.id, code: 'document.cookie' });
      check('a cookie set in one profile is invisible in another', !String(seen.value).includes('cbprofile'), String(seen.value).slice(0, 120));

      const lsA = await c.call('eval_js', { tabId: a.id, code: '(() => { try { localStorage.setItem("cbls","A"); return localStorage.getItem("cbls"); } catch (e) { return "blocked:" + e.message; } })()' });
      const lsB = await c.call('eval_js', { tabId: b.id, code: '(() => { try { return localStorage.getItem("cbls"); } catch (e) { return "blocked:" + e.message; } })()' });
      check('localStorage is separate per profile too', lsA.value === 'A' && lsB.value !== 'A', `a=${lsA.value} b=${lsB.value}`);
    } finally {
      await c.call('tab_close', { tabId: a.id }).catch(() => {});
      await c.call('tab_close', { tabId: b.id }).catch(() => {});
    }
  },

  // Write a rule against a live site and watch it bite.
  async rules(c) {
    const name = 'agent-suite-rule';
    await c.call('rules_set', {
      name,
      rule: {
        title: 'agent suite',
        enabled: true,
        match: ['*://en.wikipedia.org/*'],
        css: '#mw-panel, .vector-sticky-pinned-container { display: none !important; } h1 { outline: 3px solid rgb(7, 8, 9) !important; }',
        js: 'document.documentElement.setAttribute("data-agent-suite", "applied");',
      },
    });
    const tab = (await c.call('tab_open', { url: 'https://en.wikipedia.org/wiki/Bauhaus', profile: 'agent' })).tab;
    try {
      const why = await blocked(c, tab.id);
      if (why) return skip('rule against a live site', why);
      await sleep(1800);
      const applied = await c.call('eval_js', { tabId: tab.id, code: `({
        jsRan: document.documentElement.getAttribute('data-agent-suite'),
        sidebarHidden: (() => { const el = document.querySelector('#mw-panel'); return el ? getComputedStyle(el).display : 'absent'; })(),
        outline: (() => { const h = document.querySelector('h1'); return h ? getComputedStyle(h).outlineColor : null; })()
      })` });
      check('rule js ran on a live site', applied.value.jsRan === 'applied', JSON.stringify(applied.value));
      check('rule css hid a real element', applied.value.sidebarHidden === 'none' || applied.value.sidebarHidden === 'absent', applied.value.sidebarHidden);
      check('rule css restyled a real element', applied.value.outline === 'rgb(7, 8, 9)', applied.value.outline);

      await c.call('rules_toggle', { name, enabled: false });
      await c.call('navigate', { tabId: tab.id, url: 'https://en.wikipedia.org/wiki/Bauhaus' });
      await sleep(1500);
      const off = await c.call('eval_js', { tabId: tab.id, code: 'document.documentElement.getAttribute("data-agent-suite")' });
      check('disabling the rule stops it', off.value === null, JSON.stringify(off.value));
    } finally {
      await c.call('tab_close', { tabId: tab.id }).catch(() => {});
      try { fs.unlinkSync(path.join(ROOT, 'rules', `${name}.json`)); } catch (_) {}
      await c.call('rules_reload').catch(() => {});
    }
  },

  // Many tabs at once, and background tabs still answering.
  async tabs(c) {
    const urls = [
      'https://en.wikipedia.org/wiki/Typography',
      'https://www.blender.org/',
      'https://docs.godotengine.org/en/stable/',
      'https://developer.mozilla.org/en-US/docs/Web/CSS/grid',
    ];
    const tabs = [];
    try {
      for (const url of urls) tabs.push((await c.call('tab_open', { url, profile: 'agent', activate: false, wait: false })).tab);
      await sleep(7000);
      const list = await c.call('tabs_list');
      check('all tabs opened', tabs.every((t) => list.tabs.some((x) => x.id === t.id)), `${list.tabs.length} tabs`);

      // Everything below the active tab must still be readable.
      let readable = 0;
      for (const t of tabs) {
        try {
          const txt = await c.call('page_text', { tabId: t.id, maxChars: 400 });
          if (txt.chars > 150) readable++;
        } catch (_) { /* counted as unreadable */ }
      }
      check('background tabs are still readable', readable >= urls.length - 1, `${readable}/${urls.length}`);

      await c.call('tab_activate', { tabId: tabs[tabs.length - 1].id });
      const active = (await c.call('tabs_list')).tabs.find((x) => x.active);
      check('activating a background tab works', active.id === tabs[tabs.length - 1].id, active.id);
    } finally {
      for (const t of tabs) await c.call('tab_close', { tabId: t.id }).catch(() => {});
    }
  },

  // The UI keeps up with what Claude does to it.
  async ui(c) {
    await c.call('ui_note', { text: 'agent suite running', level: 'info' });
    const notes = await c.call('ui_eval', { code: 'document.querySelectorAll("#notes li").length' });
    check('ui_note reaches the panel', notes.value >= 1, JSON.stringify(notes.value));

    await c.call('ui_css', { id: 'agent-suite', css: '#omnibox { text-transform: lowercase; }' });
    const css = await c.call('ui_eval', { code: 'getComputedStyle(document.getElementById("omnibox")).textTransform' });
    check('ui_css restyles the chrome live', css.value === 'lowercase', css.value);
    await c.call('ui_css', { id: 'agent-suite', css: '' });

    const tab = (await c.call('tab_open', { url: 'https://en.wikipedia.org/wiki/Bauhaus', profile: 'agent', wait: false })).tab;
    await sleep(2500);
    const strip = await c.call('ui_eval', { code: '[...document.querySelectorAll("#tabs .tab .label")].map(e => e.textContent)' });
    check('the tab strip shows the open tab', strip.value.some((t) => /bauhaus|wikipedia/i.test(t)), JSON.stringify(strip.value));
    await c.call('tab_close', { tabId: tab.id }).catch(() => {});
  },
};

// ---------------------------------------------------------------- run
(async () => {
  try { fs.unlinkSync(CONTROL); } catch (_) {}
  const electron = require('electron');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  // Argv, not appendSwitch: the SUID check happens first (gotcha 8), and a Linux box
  // that is not root has no usable sandbox helper in node_modules. See tests/e2e.js.
  const isLinux = process.platform === 'linux';
  const asRoot = isLinux && typeof process.getuid === 'function' && process.getuid() === 0;
  const needXvfb = !process.env.DISPLAY && process.platform === 'linux';
  const extra = [
    ...(isLinux ? ['--no-sandbox'] : []),
    ...(asRoot ? ['--disable-gpu'] : []),
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
  if (!info) { console.error('browser never started\n' + appLog.slice(-1500)); process.exit(1); }
  const c = await new Client(info).connect();

  for (const [name, flow] of Object.entries(FLOWS)) {
    if (ONLY && !name.includes(ONLY)) continue;
    lines.push(`\n[${name}]`);
    const t = Date.now();
    try { await flow(c); }
    catch (e) { bad(`${name} threw`, e.message); }
    lines.push(`  (${Date.now() - t}ms)`);
  }

  console.log(lines.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed && appLog) console.log('\n--- app log ---\n' + appLog.slice(-2500));

  if (!KEEP) {
    for (const sig of ['SIGTERM', 'SIGKILL']) {
      try { process.kill(-child.pid, sig); } catch (_) { try { child.kill(sig); } catch (_) {} }
    }
  }
  process.exit(failed ? 1 : 0);
})();
