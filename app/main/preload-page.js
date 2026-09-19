'use strict';
// Runs in every page at document-start, in an isolated world the page cannot reach.
// Two jobs:
//   1. Apply site rules (CSS + JS) before the page paints, and again on SPA route changes.
//   2. Be the agent: read structure, find things, resolve refs to coordinates, type, scroll.
// Main talks to it over IPC: 'cb:call' in, 'cb:result' out.

const { ipcRenderer, webFrame } = require('electron');

// ---------------------------------------------------------------- rules
let ruleSets = [];
let lastUrl = location.href;
let scriptsDone = new Set(); // set name -> already injected for this document

// Run code in the PAGE's own world, not this isolated one.
//
// Scriptlets and rule mainJs have to touch the page's globals before the page's own
// scripts run, so neither an isolated-world eval nor an injected <script> element will
// do: the former cannot see page globals, and the latter cannot even be created at
// document-start (documentElement is still null) and would be refused under a strict
// script-src CSP anyway. webFrame.executeJavaScript from a preload runs in the main
// world, before page scripts, and is not subject to the page's CSP. Verified on
// Electron 44 against both a plain page and one sending script-src 'self'.
function runInPage(code, label) {
  try {
    webFrame.executeJavaScript(code, false);
    return true;
  } catch (e) {
    ipcRenderer.send('cb:log', { level: 'warning', msg: `${label} failed: ${e.message}` });
    return false;
  }
}

// Run a rule's `js` in a dedicated isolated world.
//
// NOT new Function(): this preload's own world inherits the page's CSP for code
// generation, so on any site whose script-src lacks 'unsafe-eval' — YouTube, most
// large sites — new Function and eval both throw "Code generation from strings
// disallowed for this context" and the rule's js silently never runs. Its css still
// applies, which makes the failure look like a broken selector rather than dead code.
//
// executeJavaScriptInIsolatedWorld is not subject to the page's CSP, has full DOM
// access, keeps its own globals between calls, and stays invisible to the page.
// All four verified on Electron 44 against a page serving script-src 'self'.
const RULE_WORLD = 1234;

function runIsolated(code, options, reason, label) {
  const wrapped = `(function (options, reason) {\n${code}\n}).call(undefined, ${JSON.stringify(options || {})}, ${JSON.stringify(reason)})`;
  try {
    const p = webFrame.executeJavaScriptInIsolatedWorld(RULE_WORLD, [{ code: wrapped }]);
    if (p && typeof p.catch === 'function') {
      p.catch((e) => ipcRenderer.send('cb:log', { level: 'error', msg: `rule ${label} js: ${e.message}` }));
    }
  } catch (e) {
    ipcRenderer.send('cb:log', { level: 'error', msg: `rule ${label} js: ${e.message}` });
  }
}

// Main-world code needs no DOM, so it goes at the true document-start: scriptlets
// defuse things before they happen. Once per document — re-running them on an SPA
// route change double-applies.
function applyMainWorld() {
  for (const set of ruleSets) {
    const scripts = [...(set.scripts || []), ...(set.mainJs ? [set.mainJs] : [])];
    if (!scripts.length || scriptsDone.has(set.name)) continue;
    scriptsDone.add(set.name);
    let ok = 0;
    for (const code of scripts) if (runInPage(code, `${set.name} main-world script`)) ok++;
    if (ok) ipcRenderer.send('cb:scriptlets', { name: set.name, count: ok, url: location.href });
  }
}

// css and js both want a document. At the moment a preload first runs there is no
// <html> yet, so anything touching the DOM throws. documentElement appears within a
// tick of the parser starting, so wait for it rather than making every rule author
// write a null guard, and rather than waiting for DOMContentLoaded, which is late
// enough to show a flash of the thing the rule removes.
function whenDocumentElement(fn) {
  if (document.documentElement) return fn();
  const iv = setInterval(() => {
    if (!document.documentElement) return;
    clearInterval(iv);
    fn();
  }, 0);
  setTimeout(() => clearInterval(iv), 8000);
}

function applyRules(reason) {
  try {
    applyMainWorld();
    if (!document.documentElement) return whenDocumentElement(() => applyRules(reason));
    for (const set of ruleSets) {
      // Per set, so one rule failing cannot stop the rest. This used to wrap the whole
      // loop: at document-start there is no <head> or <html> yet, the style append threw
      // null, and every later rule in the list was skipped along with it.
      try {
        if (set.css) {
          const host = document.head || document.documentElement;
          const id = `cb-rule-${set.name}`;
          let el = document.getElementById(id);
          if (!el) {
            el = document.createElement('style');
            el.id = id;
            el.setAttribute('data-claude-browser', 'rule');
            host.appendChild(el);
          }
          if (el.textContent !== set.css) el.textContent = set.css;
        }
        if (set.js) runIsolated(set.js, set.options, reason, set.name);
      } catch (e) {
        ipcRenderer.send('cb:log', { level: 'error', msg: `rule ${set.name}: ${e.message}` });
      }
    }
  } catch (e) {
    ipcRenderer.send('cb:log', { level: 'error', msg: `applyRules: ${e.message}` });
  }
}

try {
  ruleSets = ipcRenderer.sendSync('cb:rules-for-url', location.href) || [];
} catch (_) { ruleSets = []; }
applyRules('start');

// Re-apply as the document grows (head and body appear after document-start).
const earlyObserver = new MutationObserver(() => applyRules('mutate'));
whenDocumentElement(() => {
  try { earlyObserver.observe(document.documentElement, { childList: true, subtree: false }); } catch (_) {}
});
document.addEventListener('DOMContentLoaded', () => applyRules('domcontentloaded'));
window.addEventListener('load', () => { applyRules('load'); setTimeout(() => earlyObserver.disconnect(), 5000); });

// SPA route changes (YouTube et al) — re-fetch rules and re-apply.
function onUrlMaybeChanged() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  refs.clear(); refMap = new WeakMap(); refSeq = 0;
  // Same document, so main-world code stays applied; do not clear scriptsDone here.
  try { ruleSets = ipcRenderer.sendSync('cb:rules-for-url', location.href) || []; } catch (_) {}
  applyRules('spa');
  ipcRenderer.send('cb:navigated', { url: location.href, title: document.title });
}
for (const m of ['pushState', 'replaceState']) {
  const orig = history[m];
  history[m] = function (...args) { const r = orig.apply(this, args); setTimeout(onUrlMaybeChanged, 0); return r; };
}
window.addEventListener('popstate', () => setTimeout(onUrlMaybeChanged, 0));
window.addEventListener('yt-navigate-finish', () => setTimeout(onUrlMaybeChanged, 0), true);
setInterval(onUrlMaybeChanged, 700);

// ---------------------------------------------------------------- agent
let refs = new Map();      // ref -> element
let refMap = new WeakMap();// element -> ref
let refSeq = 0;

const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=radio],[role=menuitem],[role=option],[role=switch],[role=searchbox],[role=textbox],[role=combobox],[contenteditable=""],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"])';
const HEADINGS = 'h1,h2,h3,h4,h5,h6,[role=heading]';
const TEXTISH = 'p,li,td,th,dt,dd,blockquote,figcaption,pre,label,span[role],article,section>div';
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'META', 'LINK', 'HEAD']);

function refFor(el) {
  let r = refMap.get(el);
  if (!r) { r = 'e' + (++refSeq); refMap.set(el, r); refs.set(r, el); }
  return r;
}

function deref(ref) {
  const el = refs.get(ref);
  if (!el) throw new Error(`Unknown ref "${ref}". Call page_read or find again — the page may have changed.`);
  if (!el.isConnected) throw new Error(`Ref "${ref}" is no longer in the document. Call page_read or find again.`);
  return el;
}

function resolve({ ref, selector }) {
  if (ref) return deref(ref);
  if (selector) {
    const el = deepQuery(selector);
    if (!el) throw new Error(`No element matches selector ${JSON.stringify(selector)}.`);
    return el;
  }
  throw new Error('Give a ref or a selector.');
}

function deepQuery(selector, root = document) {
  const direct = root.querySelector(selector);
  if (direct) return direct;
  const walk = (node) => {
    for (const el of node.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const hit = el.shadowRoot.querySelector(selector);
        if (hit) return hit;
        const deeper = walk(el.shadowRoot);
        if (deeper) return deeper;
      }
    }
    return null;
  };
  return walk(root);
}

function* walkAll(root) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    let kids;
    try { kids = node.children; } catch (_) { continue; }
    for (const el of kids || []) {
      if (SKIP.has(el.tagName)) continue;
      yield el;
      if (el.shadowRoot) stack.push(el.shadowRoot);
      stack.push(el);
    }
  }
}

function visible(el) {
  try {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return true;
  } catch (_) { return false; }
}

function inViewport(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

function label(el) {
  const pick = (s) => (s || '').replace(/\s+/g, ' ').trim();
  let t = pick(el.getAttribute?.('aria-label'));
  if (!t && el.getAttribute?.('aria-labelledby')) {
    const ids = el.getAttribute('aria-labelledby').split(/\s+/);
    t = pick(ids.map((i) => document.getElementById(i)?.textContent || '').join(' '));
  }
  if (!t && el.tagName === 'INPUT' && el.labels?.length) t = pick(el.labels[0].textContent);
  if (!t) t = pick(el.innerText || el.textContent);
  if (!t) t = pick(el.getAttribute?.('title') || el.getAttribute?.('placeholder') || el.getAttribute?.('alt') || el.value);
  return t.slice(0, 200);
}

function role(el) {
  const explicit = el.getAttribute?.('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
  if (tag === 'button') return 'button';
  if (tag === 'input') return (el.type || 'text');
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'img') return 'image';
  return tag;
}

function describe(el) {
  const d = { ref: refFor(el), role: role(el), text: label(el) };
  if (el.tagName === 'A' && el.href) d.href = el.href.slice(0, 300);
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    d.value = String(el.value ?? '').slice(0, 200);
    if (el.type === 'checkbox' || el.type === 'radio') d.checked = el.checked;
  }
  if (el.getAttribute?.('aria-expanded')) d.expanded = el.getAttribute('aria-expanded');
  if (el.disabled) d.disabled = true;
  if (!inViewport(el)) d.offscreen = true;
  return d;
}

function elementCenter(el) {
  const r = el.getBoundingClientRect();
  // Clamp to viewport so the synthesized click lands on something real.
  const x = Math.round(Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1));
  const y = Math.round(Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1));
  return { x, y, rect: { x: r.left, y: r.top, width: r.width, height: r.height } };
}

function scrollIntoView(el) {
  try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (_) { try { el.scrollIntoView(); } catch (_) {} }
}

// ---------------------------------------------------------------- methods
const methods = {
  ping: () => ({ url: location.href, title: document.title, ready: document.readyState }),

  setRules(sets) {
    ruleSets = sets || [];
    applyRules('push');
    return { applied: ruleSets.map((s) => s.name), mainWorldRan: [...scriptsDone] };
  },

  pageText({ selector, maxChars = 20000 }) {
    const root = selector ? resolve({ selector }) : (document.querySelector('main,article,[role=main]') || document.body);
    const raw = (root?.innerText || document.body?.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return {
      url: location.href,
      title: document.title,
      chars: raw.length,
      truncated: raw.length > maxChars,
      text: raw.slice(0, maxChars),
    };
  },

  pageRead({ filter = 'interactive', selector, maxItems = 300 }) {
    const root = selector ? resolve({ selector }) : document.body;
    const out = [];
    const seen = new Set();
    for (const el of walkAll(root)) {
      if (out.length >= maxItems) break;
      if (!visible(el)) continue;
      let keep = el.matches?.(INTERACTIVE) || el.matches?.(HEADINGS);
      if (!keep && filter === 'all') keep = el.matches?.(TEXTISH) && (el.innerText || '').trim().length > 1;
      if (!keep) continue;
      // Skip wrappers whose only content is a child we already listed.
      const t = label(el);
      if (!t && !el.matches(INTERACTIVE)) continue;
      const key = `${role(el)}|${t}|${Math.round(el.getBoundingClientRect().top)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(describe(el));
    }
    return { url: location.href, title: document.title, count: out.length, truncated: out.length >= maxItems, elements: out };
  },

  find({ query, maxItems = 20 }) {
    const q = String(query).toLowerCase();
    const out = [];
    for (const el of walkAll(document.body)) {
      if (out.length >= maxItems) break;
      if (!visible(el)) continue;
      const hay = [
        el.getAttribute?.('aria-label'), el.getAttribute?.('title'), el.getAttribute?.('placeholder'),
        el.getAttribute?.('alt'), el.getAttribute?.('name'), el.value, el.innerText,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) continue;
      // Prefer the innermost match: drop an ancestor already recorded.
      const last = out[out.length - 1];
      if (last && refs.get(last.ref)?.contains(el)) out.pop();
      out.push(describe(el));
    }
    return { query, count: out.length, elements: out };
  },

  point(spec) {
    const el = resolve(spec);
    scrollIntoView(el);
    const c = elementCenter(el);
    return { ...c, ref: refFor(el), text: label(el), role: role(el) };
  },

  focus(spec) {
    const el = resolve(spec);
    scrollIntoView(el);
    try { el.focus({ preventScroll: true }); } catch (_) {}
    return { ok: document.activeElement === el, ...elementCenter(el) };
  },

  clearField(spec) {
    const el = spec.ref || spec.selector ? resolve(spec) : document.activeElement;
    if (!el) throw new Error('Nothing focused to clear.');
    try { el.focus({ preventScroll: true }); } catch (_) {}
    if ('value' in el) {
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
      setter ? setter.call(el, '') : (el.value = '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = '';
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    return { ok: true };
  },

  readField(spec) {
    const el = spec.ref || spec.selector ? resolve(spec) : document.activeElement;
    return { value: el && 'value' in el ? String(el.value) : (el?.textContent ?? ''), ref: el ? refFor(el) : null };
  },

  scroll({ ref, selector, to, dx = 0, dy = 0 }) {
    if (to === 'element' || ((ref || selector) && !to && !dy && !dx)) {
      const el = resolve({ ref, selector });
      scrollIntoView(el);
      return { scrollY: scrollY, scrolledTo: refFor(el) };
    }
    const target = (ref || selector) ? resolve({ ref, selector }) : null;
    const scroller = target || document.scrollingElement || document.documentElement;
    if (to === 'top') scroller.scrollTo({ top: 0, behavior: 'instant' });
    else if (to === 'bottom') scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
    else scroller.scrollBy({ left: dx, top: dy, behavior: 'instant' });
    return { scrollY: scroller.scrollTop ?? scrollY, scrollHeight: scroller.scrollHeight, viewport: { width: innerWidth, height: innerHeight } };
  },

  selectOption({ ref, selector, value, label: lbl }) {
    const el = resolve({ ref, selector });
    if (el.tagName !== 'SELECT') throw new Error('Not a <select>.');
    let chosen = null;
    for (const o of el.options) {
      if ((value != null && o.value === value) || (lbl != null && o.textContent.trim().toLowerCase() === String(lbl).trim().toLowerCase())) { chosen = o; break; }
    }
    if (!chosen && lbl != null) {
      for (const o of el.options) if (o.textContent.toLowerCase().includes(String(lbl).toLowerCase())) { chosen = o; break; }
    }
    if (!chosen) throw new Error(`No option matching ${JSON.stringify(value ?? lbl)}. Options: ${[...el.options].map((o) => o.textContent.trim()).slice(0, 20).join(' | ')}`);
    el.value = chosen.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { selected: chosen.textContent.trim(), value: chosen.value };
  },

  waitFor({ selector, text, urlIncludes }) {
    if (selector && deepQuery(selector)) return { met: 'selector' };
    if (text && (document.body?.innerText || '').toLowerCase().includes(String(text).toLowerCase())) return { met: 'text' };
    if (urlIncludes && location.href.includes(urlIncludes)) return { met: 'url' };
    return { met: null };
  },

  elementRect(spec) {
    const el = resolve(spec);
    scrollIntoView(el);
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), width: Math.round(Math.min(r.width, innerWidth)), height: Math.round(Math.min(r.height, innerHeight)) };
  },

  viewport: () => ({ width: innerWidth, height: innerHeight, scrollY, scrollHeight: document.documentElement.scrollHeight, devicePixelRatio }),
};

ipcRenderer.on('cb:call', async (_e, { id, method, args }) => {
  try {
    const fn = methods[method];
    if (!fn) throw new Error(`Unknown page method "${method}".`);
    const value = await fn(args || {});
    ipcRenderer.send('cb:result', { id, ok: true, value });
  } catch (err) {
    ipcRenderer.send('cb:result', { id, ok: false, error: String(err?.message || err) });
  }
});

ipcRenderer.send('cb:preload-ready', { url: location.href });
