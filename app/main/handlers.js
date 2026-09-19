'use strict';
// Every command in shared/commands.js is implemented here.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, nativeImage } = require('electron');
const { paths } = require('./paths');
const { Profiles } = require('./profiles');
const log = require('./log').make('cmd');

const MOD = { shift: 'shift', control: 'control', alt: 'alt', meta: 'meta' };

function makeHandlers(ctx) {
  const { tabsMgr, rules, profiles, settings, win, chrome, control, state, adblock } = ctx;

  const page = (tabId) => tabsMgr.get(tabId);
  const callPage = (tabId, method, args, timeout) => tabsMgr.call(page(tabId), method, args, timeout);

  async function pointFor(tabId, spec) {
    if (typeof spec.x === 'number' && typeof spec.y === 'number') return { x: spec.x, y: spec.y };
    const p = await callPage(tabId, 'point', { ref: spec.ref, selector: spec.selector });
    return p;
  }

  function sendMouse(tab, type, { x, y, button = 'left', clickCount = 1, modifiers = [] }) {
    tab.wc.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button, clickCount, modifiers: modifiers.map((m) => MOD[m]).filter(Boolean) });
  }

  function sendKey(tab, key, modifiers = []) {
    const mods = modifiers.map((m) => MOD[m]).filter(Boolean);
    tab.wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: mods });
    if (key.length === 1 && !mods.some((m) => m === 'control' || m === 'meta' || m === 'alt')) {
      tab.wc.sendInputEvent({ type: 'char', keyCode: key, modifiers: mods });
    }
    tab.wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: mods });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Run `code` as an expression if it is one, otherwise as a statement body.
  // Deciding by syntax beats guessing from the text: `(() => { return 1 })()`
  // is an expression that contains the word "return".
  async function runJs(wc, code) {
    const asExpression = `(async () => { return (${code}\n); })()`;
    const asStatements = `(async () => { ${code}\n })()`;
    try {
      return await wc.executeJavaScript(asExpression, true);
    } catch (e) {
      if (!/SyntaxError/i.test(String(e?.message || e))) throw e;
      return wc.executeJavaScript(asStatements, true);
    }
  }

  const H = {
    // ------------------------------------------------------------- app
    async status() {
      return {
        app: 'claude-browser',
        version: app.getVersion?.() || require('../../package.json').version,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        control: { host: settings.control.host, port: control.port, clients: control.clients.size },
        window: win.getBounds(),
        tabs: tabsMgr.list(),
        activeTab: tabsMgr.activeId,
        profiles: profiles.names(),
        defaultProfile: settings.defaultProfile,
        theme: state.theme,
        rules: rules.list(),
        adblock: adblock.status(),
        paths: { root: paths.root, rules: paths.rules, themes: paths.themes, logs: paths.logs },
      };
    },

    async window({ action, bounds }) {
      switch (action) {
        case 'focus': win.show(); win.focus(); break;
        case 'minimize': win.minimize(); break;
        case 'maximize': win.maximize(); break;
        case 'restore': win.unmaximize(); win.restore(); break;
        case 'fullscreen': win.setFullScreen(true); break;
        case 'unfullscreen': win.setFullScreen(false); break;
        case 'setBounds': win.setBounds({ ...win.getBounds(), ...bounds }); break;
        case 'get': break;
      }
      return { bounds: win.getBounds(), fullscreen: win.isFullScreen(), minimized: win.isMinimized() };
    },

    // ------------------------------------------------------------- tabs
    async tabs_list() { return { tabs: tabsMgr.list(), activeTab: tabsMgr.activeId }; },

    async tab_open({ url, profile, activate = true, wait = true }) {
      const tab = tabsMgr.create({ profile, activate });
      const target = url || settings.homeUrl;
      if (target && target !== 'about:blank') await tabsMgr.loadURL(tab, target, { wait });
      return { tab: tab.info() };
    },

    async tab_close({ tabId }) { return tabsMgr.close(tabId); },
    async tab_activate({ tabId }) { return { tab: tabsMgr.activate(tabId).info() }; },

    async navigate({ tabId, url, wait = true }) {
      const tab = tabsMgr.tabs.size ? page(tabId) : tabsMgr.create({});
      return { tab: await tabsMgr.loadURL(tab, url, { wait }) };
    },

    async history({ tabId, action }) {
      const tab = page(tabId);
      const nav = tab.wc.navigationHistory;
      if (action === 'back') { if (!nav.canGoBack()) throw new Error('Nothing to go back to.'); nav.goBack(); }
      else if (action === 'forward') { if (!nav.canGoForward()) throw new Error('Nothing to go forward to.'); nav.goForward(); }
      else if (action === 'reload') tab.wc.reload();
      else if (action === 'stop') tab.wc.stop();
      if (action !== 'stop') await tabsMgr.waitForLoad(tab, 20000);
      return { tab: tab.info() };
    },

    async wait_for({ tabId, load, selector, text, urlIncludes, timeoutMs = 15000 }) {
      const tab = page(tabId);
      const deadline = Date.now() + timeoutMs;
      if (load || (!selector && !text && !urlIncludes)) {
        if (tab.loading) await tabsMgr.waitForLoad(tab, timeoutMs);
        if (!selector && !text && !urlIncludes) return { met: 'load', tab: tab.info() };
      }
      while (Date.now() < deadline) {
        try {
          const r = await callPage(tabId, 'waitFor', { selector, text, urlIncludes }, 5000);
          if (r.met) return { met: r.met, tab: tab.info() };
        } catch (_) { /* page navigating; retry */ }
        await sleep(250);
      }
      throw new Error(`Timed out after ${timeoutMs} ms waiting for ${JSON.stringify({ selector, text, urlIncludes })}. Current URL: ${tab.url}`);
    },

    // ------------------------------------------------------------- read
    async page_text({ tabId, selector, maxChars }) { return callPage(tabId, 'pageText', { selector, maxChars }); },
    async page_read({ tabId, filter, selector, maxItems }) { return callPage(tabId, 'pageRead', { filter, selector, maxItems }, 25000); },
    async find({ tabId, query, maxItems }) { return callPage(tabId, 'find', { query, maxItems }, 20000); },

    async screenshot({ tabId, ref, selector, maxWidth = 1280, format = 'jpeg' }) {
      const tab = page(tabId);
      let rect;
      if (ref || selector) rect = await callPage(tabId, 'elementRect', { ref, selector });
      let img = await tab.wc.capturePage(rect && rect.width > 0 ? rect : undefined);
      const size = img.getSize();
      if (size.width > maxWidth) img = img.resize({ width: maxWidth, quality: 'good' });
      const buf = format === 'png' ? img.toPNG() : img.toJPEG(78);
      return {
        mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
        width: img.getSize().width,
        height: img.getSize().height,
        url: tab.url,
        title: tab.title,
        base64: buf.toString('base64'),
      };
    },

    async eval_js({ tabId, code }) {
      const tab = page(tabId);
      try {
        const value = await runJs(tab.wc, code);
        return { value: value === undefined ? null : value };
      } catch (e) {
        throw new Error(`Page threw: ${e.message}`);
      }
    },

    async console_read({ tabId, level = 'all', pattern, limit = 100, clear = false }) {
      const tab = page(tabId);
      let out = tab.console;
      if (level !== 'all') out = out.filter((m) => String(m.level).toLowerCase().startsWith(level[0]));
      if (pattern) { const re = new RegExp(pattern, 'i'); out = out.filter((m) => re.test(m.message)); }
      const result = { count: out.length, messages: out.slice(-limit) };
      if (clear) tab.console = [];
      return result;
    },

    async network_read({ tabId, pattern, limit = 100, clear = false }) {
      const tab = page(tabId);
      let out = tab.network;
      if (pattern) { const re = new RegExp(pattern, 'i'); out = out.filter((r) => re.test(r.url)); }
      const result = { count: out.length, requests: out.slice(-limit) };
      if (clear) tab.network = [];
      return result;
    },

    // ------------------------------------------------------------- act
    async click({ tabId, ref, selector, x, y, button = 'left', clickCount = 1, modifiers = [] }) {
      const tab = page(tabId);
      const pt = await pointFor(tabId, { ref, selector, x, y });
      sendMouse(tab, 'mouseMove', { ...pt, button, modifiers });
      await sleep(20);
      sendMouse(tab, 'mouseDown', { ...pt, button, clickCount, modifiers });
      await sleep(25);
      sendMouse(tab, 'mouseUp', { ...pt, button, clickCount, modifiers });
      await sleep(120);
      return { clicked: { x: pt.x, y: pt.y, ref: pt.ref ?? null, text: pt.text ?? null }, url: tab.url };
    },

    async hover({ tabId, ref, selector, x, y }) {
      const tab = page(tabId);
      const pt = await pointFor(tabId, { ref, selector, x, y });
      sendMouse(tab, 'mouseMove', pt);
      await sleep(80);
      return { hovered: { x: pt.x, y: pt.y, ref: pt.ref ?? null } };
    },

    async type({ tabId, ref, selector, text, clear = false, submit = false, mode = 'insert' }) {
      const tab = page(tabId);
      if (ref || selector) {
        const pt = await pointFor(tabId, { ref, selector });
        sendMouse(tab, 'mouseMove', pt); await sleep(15);
        sendMouse(tab, 'mouseDown', pt); await sleep(20); sendMouse(tab, 'mouseUp', pt);
        await sleep(60);
        await callPage(tabId, 'focus', { ref, selector });
      }
      if (clear) {
        sendKey(tab, 'a', ['control']);
        await sleep(30);
        sendKey(tab, 'Delete');
        await sleep(30);
        try { await callPage(tabId, 'clearField', { ref, selector }); } catch (_) {}
      }
      if (mode === 'keys') {
        for (const ch of String(text)) { sendKey(tab, ch); await sleep(12); }
      } else {
        tab.wc.insertText(String(text));
      }
      await sleep(80);
      let value = null;
      try { value = (await callPage(tabId, 'readField', { ref, selector })).value; } catch (_) {}
      if (submit) { sendKey(tab, 'Enter'); await sleep(250); }
      return { typed: String(text).length, fieldValue: value, url: tab.url };
    },

    async press_key({ tabId, key, modifiers = [], repeat = 1 }) {
      const tab = page(tabId);
      for (let i = 0; i < Math.max(1, repeat); i++) { sendKey(tab, key, modifiers); await sleep(30); }
      await sleep(80);
      return { pressed: key, repeat, url: tab.url };
    },

    async scroll({ tabId, ref, selector, to, dx, dy }) {
      return callPage(tabId, 'scroll', { ref, selector, to, dx, dy });
    },

    async select_option({ tabId, ref, selector, value, label }) {
      return callPage(tabId, 'selectOption', { ref, selector, value, label });
    },

    // ------------------------------------------------------------- ui
    async ui_css({ id = 'claude', css, persist = false }) {
      await chrome.send('ui:css', { id, css });
      if (persist) {
        const file = path.join(paths.themes, 'custom.css');
        let body = '';
        try { body = fs.readFileSync(file, 'utf8'); } catch (_) {}
        const marker = `/* >>> ${id} */`;
        const end = `/* <<< ${id} */`;
        const block = css ? `${marker}\n${css}\n${end}` : '';
        const re = new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
        body = re.test(body) ? body.replace(re, block) : (body + '\n' + block);
        fs.writeFileSync(file, body.trim() + '\n');
      }
      return { id, bytes: (css || '').length, persisted: persist };
    },

    async ui_eval({ code }) {
      const value = await runJs(chrome.wc, code);
      return { value: value === undefined ? null : value };
    },

    async ui_reload() { chrome.wc.reloadIgnoringCache(); await sleep(400); return { reloaded: true }; },
    async ui_panel({ open }) { await chrome.send('ui:panel', { open }); ctx.layout(); return { panelOpen: open }; },
    async ui_note({ text, level = 'info' }) {
      await chrome.send('ui:note', { text, level, t: Date.now() });
      return { posted: true };
    },

    async theme_list() {
      let files = [];
      try { files = fs.readdirSync(paths.themes).filter((f) => f.endsWith('.css')).map((f) => f.replace(/\.css$/, '')); } catch (_) {}
      return { themes: files, active: state.theme };
    },

    async theme_set({ name }) {
      const file = path.join(paths.themes, `${name}.css`);
      if (!fs.existsSync(file)) throw new Error(`No theme "${name}" in themes/. Have: ${(await H.theme_list()).themes.join(', ')}`);
      state.theme = name;
      ctx.saveSettings({ theme: name });
      await chrome.send('ui:theme', { name, css: fs.readFileSync(file, 'utf8') });
      return { theme: name };
    },

    // ------------------------------------------------------------- rules
    async rules_list() { return { rules: rules.list() }; },
    async rules_get({ name }) {
      const r = rules.get(name);
      if (!r) throw new Error(`No rule set "${name}". Have: ${rules.list().map((x) => x.name).join(', ')}`);
      return { name, rule: r };
    },
    async rules_set({ name, rule }) {
      const info = rules.save(name, rule);
      await ctx.reapplyRules();
      return { saved: info };
    },
    async rules_toggle({ name, enabled }) {
      const info = rules.toggle(name, enabled);
      await ctx.reapplyRules();
      return { rule: info };
    },
    async rules_reload() {
      const list = rules.load();
      await ctx.reapplyRules();
      return { rules: list };
    },

    // ------------------------------------------------------------- ad blocking
    async adblock_status() { return adblock.status(); },

    async adblock_set({ enabled, lists, allowlist, customFilters }) {
      const next = { ...(settings.adblock || {}) };
      if (enabled !== undefined) next.enabled = enabled;
      if (lists !== undefined) next.lists = lists;
      if (allowlist !== undefined) next.allowlist = allowlist;
      if (customFilters !== undefined) next.customFilters = customFilters;
      settings.adblock = next;
      adblock.settings = next;
      ctx.saveSettings({ adblock: next });
      if (customFilters !== undefined) adblock.buildCustom();
      if (lists !== undefined) { try { await adblock.update(); } catch (e) { log.warn('list swap failed', e.message); } }
      await ctx.reapplyRules();
      const status = adblock.status();
      // The UI needs to know however the change was made, including over the socket.
      ctx.broadcast({ type: 'adblock-changed', adblock: status });
      return status;
    },

    async adblock_update() {
      const status = await adblock.update();
      ctx.broadcast({ type: 'adblock-changed', adblock: status });
      return status;
    },

    // ------------------------------------------------------------- composed pages
    async page_create({ name, html, open = true, profile }) {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(name)) throw new Error(`Invalid page name "${name}". Letters, digits, - and _ only.`);
      const file = path.join(paths.pages, `${name}.html`);
      fs.writeFileSync(file, html);
      const url = pathToFileURL(file).href;
      let tab = null;
      if (open) {
        const existing = [...tabsMgr.tabs.values()].find((t) => t.url.startsWith(url));
        if (existing) { tabsMgr.activate(existing.id); existing.wc.reload(); tab = existing.info(); }
        else tab = (await H.tab_open({ url, profile, activate: true, wait: true })).tab;
      }
      return { name, file, url, bytes: Buffer.byteLength(html), tab };
    },

    async page_list() {
      let files = [];
      try { files = fs.readdirSync(paths.pages).filter((f) => f.endsWith('.html')); } catch (_) {}
      return {
        pages: files.map((f) => {
          const s = fs.statSync(path.join(paths.pages, f));
          return { name: f.replace(/\.html$/, ''), bytes: s.size, modified: s.mtime.toISOString(), url: pathToFileURL(path.join(paths.pages, f)).href };
        }),
      };
    },

    async page_read_source({ name }) {
      const file = path.join(paths.pages, `${name}.html`);
      if (!fs.existsSync(file)) throw new Error(`No composed page "${name}". Have: ${(await H.page_list()).pages.map((p) => p.name).join(', ') || 'none'}`);
      return { name, html: fs.readFileSync(file, 'utf8') };
    },

    async page_delete({ name }) {
      const file = path.join(paths.pages, `${name}.html`);
      if (!fs.existsSync(file)) throw new Error(`No composed page "${name}".`);
      fs.unlinkSync(file);
      return { deleted: name };
    },

    // ------------------------------------------------------------- profiles
    async profiles_list() {
      const counts = {};
      for (const t of tabsMgr.tabs.values()) counts[t.profile] = (counts[t.profile] || 0) + 1;
      const names = new Set([...profiles.names(), settings.defaultProfile, settings.claudeProfile]);
      return { profiles: [...names].map((n) => ({ name: n, openTabs: counts[n] || 0, isDefault: n === settings.defaultProfile })) };
    },

    async profile_clear({ name }) {
      Profiles.validate(name);
      for (const t of [...tabsMgr.tabs.values()]) if (t.profile === name) tabsMgr.close(t.id);
      await profiles.clear(name);
      return { cleared: name };
    },
  };

  return H;
}

module.exports = { makeHandlers };
