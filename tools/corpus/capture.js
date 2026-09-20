// Corpus capture. NEXT.md B1, ADR 0008.
//
//   node tools/corpus/capture.js              capture every page in pages.js not yet captured
//   node tools/corpus/capture.js <id>...      only these ids
//   --force                                   recapture even if a capture exists
//   --dry                                     list what would be captured and exit
//   --shots                                   only retake screenshots that failed; DOM and
//                                             regions on disk are left exactly as they are
//
// Drives the running browser over its control socket (launch it first: `status` from
// the MCP, or `npm start`). For each page: open it in the "claude" profile, scroll to
// the bottom in viewport steps so lazy content loads, scroll back to the top, then
// write four files to corpus/pages/<id>/:
//
//   dom.html      the rendered DOM with geometry baked in. Every element carries
//                 data-mx-r="left,top,width,height" in page pixels, data-mx-h="1" if it
//                 is not visible, data-mx-f="size/weight" where its font differs from
//                 its parent's, and images carry data-mx-img="naturalWidth,naturalHeight".
//                 Shadow roots are written as <template shadowrootmode>. Scripts and
//                 stylesheets are dropped: the geometry is what they produced.
//   regions.json  what tools/label/extract.js saw, the feature set B2 labels and B3
//                 scores on.
//   shot.jpg      the viewport at the top of the page, for the person reviewing labels.
//   meta.json     url requested and final, title, timing, blocked-request count, tier.
//
// corpus/manifest.json is rewritten from the meta files after every run. Capturing is
// the only thing that changes the corpus; nothing downstream writes here.

'use strict';

const fs = require('fs');
const path = require('path');
const { connect, ROOT } = require('../lib/control');
const { EXTRACT_SOURCE } = require('../label/extract');
const { PAGES } = require('./pages');

const CORPUS = path.join(ROOT, 'corpus');
const PAGES_DIR = path.join(CORPUS, 'pages');
const PROFILE = 'claude';
const SETTLE_MS = 2500;        // after load, before scrolling: hydration
const SCROLL_STEP_MS = 350;    // per viewport step
const MAX_SCROLL_STEPS = 30;   // infinite pages stop here
const MAX_DOM_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const has = (f) => { const i = argv.indexOf(f); if (i < 0) return false; argv.splice(i, 1); return true; };
const FORCE = has('--force');
const DRY = has('--dry');
const SHOTS = has('--shots');
const ONLY = new Set(argv);

// ---------------------------------------------------------------- in-page code
// Serialise the DOM with geometry. Runs in the page. Returns { html, elements, truncated }.
const SERIALISE_SOURCE = `(() => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK']);
  const MAX = ${MAX_DOM_BYTES};
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  let out = [];
  let size = 0;
  let elements = 0;
  let truncated = false;
  const push = (s) => { if (truncated) return; size += s.length; if (size > MAX) { truncated = true; return; } out.push(s); };

  function font(el) {
    const cs = getComputedStyle(el);
    return Math.round(parseFloat(cs.fontSize)) + '/' + cs.fontWeight;
  }
  function node(n, parentFont) {
    if (n.nodeType === 3) { push(esc(n.nodeValue)); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (SKIP.has(n.tagName)) return;
    if (tag === 'template' && !n.content) return;
    elements++;
    let attrs = '';
    for (const a of n.attributes) {
      if (/^on/i.test(a.name)) continue;
      const v = a.value.length > 1000 ? a.value.slice(0, 1000) + '\\u2026' : a.value;
      attrs += ' ' + a.name + '="' + escAttr(v) + '"';
    }
    let f = parentFont;
    if (n.namespaceURI === 'http://www.w3.org/1999/xhtml' && tag !== 'html' && tag !== 'head' && !n.closest('head')) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      const hidden = cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || (r.width <= 0 && r.height <= 0);
      attrs += ' data-mx-r="' + [r.left + scrollX, r.top + scrollY, r.width, r.height].map(Math.round).join(',') + '"';
      if (hidden) attrs += ' data-mx-h="1"';
      if (cs.position === 'fixed' || cs.position === 'sticky') attrs += ' data-mx-pos="' + cs.position + '"';
      if (cs.display !== 'none') {
        f = font(n);
        if (f !== parentFont) attrs += ' data-mx-f="' + f + '"';
      }
      if (tag === 'img') attrs += ' data-mx-img="' + n.naturalWidth + ',' + n.naturalHeight + '"';
    }
    push('<' + tag + attrs + '>');
    if (VOID.has(tag)) return;
    if (n.shadowRoot) {
      push('<template shadowrootmode="' + n.shadowRoot.mode + '">');
      for (const c of n.shadowRoot.childNodes) node(c, f);
      push('</template>');
    }
    if (tag === 'iframe') { push('</iframe>'); return; }
    for (const c of n.childNodes) node(c, f);
    push('</' + tag + '>');
  }
  push('<!DOCTYPE html>\\n<!-- Captured by Mondrian tools/corpus/capture.js. ' + location.href + ' ' + new Date().toISOString() + ' -->\\n');
  node(document.documentElement, '');
  return { html: out.join(''), elements, truncated, bytes: size };
})()`;

// Scroll one viewport, report whether the page has more.
const SCROLL_SOURCE = `(() => {
  const before = scrollY;
  scrollBy(0, innerHeight * 0.9);
  const max = document.documentElement.scrollHeight - innerHeight;
  return { y: scrollY, moved: scrollY !== before, atBottom: scrollY >= max - 2, height: document.documentElement.scrollHeight };
})()`;

const FIRST_LINK = (selector, pattern) => `(() => {
  const re = ${pattern ? 'new RegExp(' + JSON.stringify(pattern) + ')' : 'null'};
  for (const a of document.querySelectorAll(${JSON.stringify(selector)})) if (!re || re.test(a.href)) return a.href;
  return null;
})()`;

// ---------------------------------------------------------------- one page
async function capture(client, entry, resolvedUrl) {
  const dir = path.join(PAGES_DIR, entry.id);
  const t0 = Date.now();
  const tab = await client.call('tab_open', { url: resolvedUrl, profile: PROFILE, activate: true, wait: true });
  const tabId = tab.id || tab.tabId || (tab.tab && tab.tab.id);
  try {
    await client.call('wait_for', { tabId, load: true, timeoutMs: 20000 }).catch(() => {});
    await sleep(SETTLE_MS);

    // Scroll through so lazy images, infinite lists and late hydration all happen.
    let steps = 0;
    for (; steps < MAX_SCROLL_STEPS; steps++) {
      const { value: s } = await client.call('eval_js', { tabId, code: SCROLL_SOURCE });
      if (!s || !s.moved || s.atBottom) break;
      await sleep(SCROLL_STEP_MS);
    }
    await client.call('eval_js', { tabId, code: 'scrollTo(0, 0)' });
    await sleep(800);

    const { value: dom } = await client.call('eval_js', { tabId, code: SERIALISE_SOURCE }, 90000);
    const { value: page } = await client.call('eval_js', { tabId, code: EXTRACT_SOURCE }, 90000);
    if (!page || !Array.isArray(page.regions)) throw new Error(`extractor returned ${JSON.stringify(page).slice(0, 200)}`);
    if (page.viewport.width === 0) throw new Error('viewport is 0x0: the browser window is minimised or hidden');
    // The viewport shot is for the reviewer; losing it must not lose the capture. Chromium
    // reports "display surface not available" when the window is occluded; one retry.
    let shot = null, shotError;
    for (let i = 0; i < 2 && !shot; i++) {
      try { shot = await client.call('screenshot', { tabId, maxWidth: 1280, format: 'jpeg' }); }
      catch (e) { shotError = e.message; await sleep(1000); }
    }
    const tabs = await client.call('tabs_list', {});
    const info = (tabs.tabs || tabs).find((t) => t.id === tabId) || {};

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'dom.html'), dom.html);
    fs.writeFileSync(path.join(dir, 'regions.json'), JSON.stringify(page, null, 1));
    if (shot) fs.writeFileSync(path.join(dir, 'shot.jpg'), Buffer.from(shot.base64, 'base64'));
    const meta = {
      id: entry.id,
      site: entry.site,
      kind: entry.kind,
      tier: entry.tier,
      notes: entry.notes,
      requestedUrl: resolvedUrl,
      url: page.url,
      title: page.title,
      capturedAt: new Date().toISOString(),
      viewport: page.viewport,
      pageHeight: page.pageHeight,
      scrollSteps: steps,
      regions: page.regions.length,
      elements: dom.elements,
      domBytes: dom.bytes,
      domTruncated: dom.truncated,
      blockedRequests: info.blockedCount,
      scriptlets: info.scriptletCount,
      lastError: info.lastError || undefined,
      shotError: shot ? undefined : shotError,
      ms: Date.now() - t0,
    };
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    return meta;
  } finally {
    await client.call('tab_close', { tabId }).catch(() => {});
  }
}

// Resolve a `via` entry: first matching link on the captured page, read from its DOM
// file if it is on disk, otherwise by opening it.
async function resolveVia(client, entry) {
  const { page: fromId, selector, pattern } = entry.via;
  const from = PAGES.find((p) => p.id === fromId);
  if (!from) throw new Error(`${entry.id}: via page "${fromId}" is not in pages.js`);
  const metaPath = path.join(PAGES_DIR, fromId, 'meta.json');
  if (!fs.existsSync(metaPath)) throw new Error(`${entry.id}: capture "${fromId}" first (it is the page the link is taken from)`);
  const fromMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const tab = await client.call('tab_open', { url: fromMeta.url, profile: PROFILE, activate: true, wait: true });
  const tabId = tab.id || tab.tabId || (tab.tab && tab.tab.id);
  try {
    await sleep(1500);
    const { value: href } = await client.call('eval_js', { tabId, code: FIRST_LINK(selector, pattern) });
    if (!href) throw new Error(`${entry.id}: nothing on ${fromMeta.url} matches ${selector}${pattern ? ' and /' + pattern + '/' : ''}`);
    return href;
  } finally {
    await client.call('tab_close', { tabId }).catch(() => {});
  }
}

// Retake a screenshot for a capture that has none. The page is loaded again, so the
// shot may differ from the DOM on disk; it is for orientation, not for scoring.
async function reshoot(client, meta) {
  const dir = path.join(PAGES_DIR, meta.id);
  const tab = await client.call('tab_open', { url: meta.url, profile: PROFILE, activate: true, wait: true });
  const tabId = tab.id || tab.tabId || (tab.tab && tab.tab.id);
  try {
    await sleep(SETTLE_MS);
    const shot = await client.call('screenshot', { tabId, maxWidth: 1280, format: 'jpeg' });
    fs.writeFileSync(path.join(dir, 'shot.jpg'), Buffer.from(shot.base64, 'base64'));
    delete meta.shotError;
    meta.shotAt = new Date().toISOString();
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  } finally {
    await client.call('tab_close', { tabId }).catch(() => {});
  }
}

function writeManifest() {
  const entries = [];
  for (const p of PAGES) {
    const metaPath = path.join(PAGES_DIR, p.id, 'meta.json');
    if (fs.existsSync(metaPath)) entries.push(JSON.parse(fs.readFileSync(metaPath, 'utf8')));
    else entries.push({ id: p.id, site: p.site, kind: p.kind, tier: p.tier, captured: false });
  }
  const captured = entries.filter((e) => e.capturedAt);
  const manifest = {
    updatedAt: new Date().toISOString(),
    pages: entries.length,
    captured: captured.length,
    sites: new Set(captured.map((e) => e.site)).size,
    regions: captured.reduce((n, e) => n + (e.regions || 0), 0),
    byTier: countBy(captured, 'tier'),
    entries,
  };
  fs.mkdirSync(CORPUS, { recursive: true });
  fs.writeFileSync(path.join(CORPUS, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

const countBy = (arr, key) => arr.reduce((m, x) => { m[x[key]] = (m[x[key]] || 0) + 1; return m; }, {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, n) => { s = String(s ?? ''); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };

// ---------------------------------------------------------------- run
(async () => {
  if (SHOTS) {
    const missing = PAGES.map((p) => path.join(PAGES_DIR, p.id, 'meta.json')).filter(fs.existsSync).map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))).filter((m) => (ONLY.size === 0 || ONLY.has(m.id)) && !fs.existsSync(path.join(PAGES_DIR, m.id, 'shot.jpg')));
    console.log(`corpus: ${missing.length} captures without a screenshot`);
    if (!missing.length) return;
    const client = await connect();
    for (const meta of missing) {
      process.stdout.write(`${pad(meta.id, 24)} `);
      try { await reshoot(client, meta); console.log('ok'); } catch (e) { console.log(`FAILED: ${e.message}`); }
    }
    writeManifest();
    client.close();
    return;
  }
  const todo = PAGES.filter((p) => (ONLY.size === 0 || ONLY.has(p.id)) && (FORCE || !fs.existsSync(path.join(PAGES_DIR, p.id, 'meta.json'))));
  console.log(`corpus: ${PAGES.length} pages listed, ${todo.length} to capture${FORCE ? ' (forced)' : ''}`);
  if (DRY) { for (const p of todo) console.log(`  ${pad(p.id, 24)} ${p.url || 'via ' + p.via.page}`); return; }
  if (!todo.length) { writeManifest(); return; }

  const client = await connect();
  await client.call('ui_note', { text: `Corpus capture: ${todo.length} pages in the ${PROFILE} profile.` }).catch(() => {});
  const failures = [];
  for (const entry of todo) {
    process.stdout.write(`${pad(entry.id, 24)} `);
    try {
      const url = entry.url || await resolveVia(client, entry);
      process.stdout.write(`${url.slice(0, 70)} … `);
      const meta = await capture(client, entry, url);
      console.log(`${meta.regions} regions, ${meta.elements} elements, ${Math.round(meta.domBytes / 1024)} KB, ${meta.blockedRequests ?? '?'} blocked, ${(meta.ms / 1000).toFixed(1)}s${meta.domTruncated ? '  DOM TRUNCATED' : ''}`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      failures.push({ id: entry.id, error: e.message });
    }
  }
  const m = writeManifest();
  console.log(`\nmanifest: ${m.captured}/${m.pages} captured, ${m.sites} sites, ${m.regions} regions, tiers ${JSON.stringify(m.byTier)}`);
  if (failures.length) console.log(`failed: ${failures.map((f) => f.id).join(', ')}  (rerun with those ids)`);
  await client.call('ui_note', { text: `Corpus capture done: ${m.captured}/${m.pages} pages.`, level: failures.length ? 'warn' : 'success' }).catch(() => {});
  client.close();
})().catch((e) => { console.error(e); process.exit(1); });
