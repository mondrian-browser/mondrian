'use strict';
// Tab manager. Each tab is a WebContentsView stacked above the chrome view.
const { WebContentsView, ipcMain } = require('electron');
const path = require('path');
const { Profiles } = require('./profiles');
const log = require('./log').make('tabs');

const PRELOAD = path.join(__dirname, 'preload-page.js');
const MAX_LOG = 400;

class Tab {
  constructor({ id, profile, session, onEvent }) {
    this.id = id;
    this.profile = profile;
    this.onEvent = onEvent;
    this.console = [];
    this.network = [];
    this.blockedCount = 0;
    this.scriptletCount = 0;
    this.loading = false;
    this.lastError = null;
    this.createdAt = Date.now();

    this.view = new WebContentsView({
      webPreferences: {
        session,
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: false,
        spellcheck: true,
        scrollBounce: true,
        plugins: true,              // Chromium's PDF viewer, for composed pages that embed manuals
        backgroundThrottling: false, // background tabs stay steerable
      },
    });
    this.view.setBackgroundColor('#ffffff');
    this.wc = this.view.webContents;
    this.wire();
  }

  get url() { try { return this.wc.getURL(); } catch (_) { return ''; } }
  get title() { try { return this.wc.getTitle(); } catch (_) { return ''; } }

  info() {
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      profile: this.profile,
      loading: this.loading,
      blockedCount: this.blockedCount,
      scriptletCount: this.scriptletCount,
      canGoBack: this.wc.navigationHistory?.canGoBack() ?? false,
      canGoForward: this.wc.navigationHistory?.canGoForward() ?? false,
      lastError: this.lastError,
    };
  }

  wire() {
    const wc = this.wc;
    const emit = (type, extra) => this.onEvent({ type, tabId: this.id, ...this.info(), ...extra });

    wc.on('did-start-loading', () => { this.loading = true; this.lastError = null; emit('tab-updated'); });
    wc.on('did-stop-loading', () => { this.loading = false; emit('tab-updated'); });
    wc.on('page-title-updated', () => emit('tab-updated'));
    wc.on('page-favicon-updated', (_e, icons) => emit('tab-updated', { favicon: icons?.[0] }));
    wc.on('did-navigate', () => { this.console = []; this.network = []; this.blockedCount = 0; this.scriptletCount = 0; emit('tab-updated'); });
    wc.on('did-navigate-in-page', () => emit('tab-updated'));
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) { this.lastError = { code, desc, url }; emit('tab-updated'); }
    });
    wc.on('render-process-gone', (_e, d) => { this.lastError = { code: -1, desc: `renderer ${d.reason}` }; emit('tab-updated'); });
    wc.on('console-message', (e) => {
      // Electron 44 passes an event object with the details on it.
      const level = e.level ?? 'info';
      const message = e.message ?? '';
      this.console.push({ t: Date.now(), level: String(level), message, source: e.sourceId, line: e.lineNumber });
      if (this.console.length > MAX_LOG) this.console.shift();
    });
    wc.setWindowOpenHandler(({ url, disposition }) => {
      this.onEvent({ type: 'window-open', tabId: this.id, url, disposition, profile: this.profile });
      return { action: 'deny' };
    });
  }

  pushNetwork(entry) {
    this.network.push(entry);
    if (this.network.length > MAX_LOG) this.network.shift();
    if (entry.blocked || entry.error === 'net::ERR_BLOCKED_BY_CLIENT') { this.blockedCount++; return true; }
    return false;
  }

  destroy() {
    try { this.view.webContents.close(); } catch (_) {}
  }
}

class TabManager {
  constructor({ settings, profiles, onEvent }) {
    this.settings = settings;
    this.profiles = profiles;
    this.onEvent = onEvent;
    this.tabs = new Map();
    this.order = [];
    this.activeId = null;
    this.seq = 0;
    this.pending = new Map(); // ipc call id -> {resolve, reject, timer}
    this.callSeq = 0;
    this.win = null;
    this.bounds = { x: 0, y: 0, width: 800, height: 600 };
    this.wireIpc();
  }

  attachWindow(win) { this.win = win; }

  wireIpc() {
    ipcMain.on('cb:result', (_e, { id, ok, value, error }) => {
      const p = this.pending.get(id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(id);
      ok ? p.resolve(value) : p.reject(new Error(error));
    });
    ipcMain.on('cb:navigated', (e) => {
      const tab = this.byWebContentsId(e.sender.id);
      if (tab) this.onEvent({ type: 'tab-updated', tabId: tab.id, ...tab.info() });
    });
    ipcMain.on('cb:log', (e, { level, msg }) => {
      const tab = this.byWebContentsId(e.sender.id);
      if (tab) { tab.console.push({ t: Date.now(), level, message: `[claude-browser] ${msg}` }); }
    });
    ipcMain.on('cb:scriptlets', (e, { name, count, url }) => {
      const tab = this.byWebContentsId(e.sender.id);
      if (!tab) return;
      tab.scriptletCount += count;
      tab.console.push({ t: Date.now(), level: 'info', message: `[claude-browser] ${name}: ${count} main-world script(s) injected into ${url}` });
    });
    ipcMain.on('cb:preload-ready', () => {});
  }

  byWebContentsId(id) {
    for (const t of this.tabs.values()) if (t.wc.id === id) return t;
    return null;
  }

  get(tabId) {
    const id = tabId || this.activeId;
    const t = this.tabs.get(id);
    if (!t) throw new Error(tabId ? `No tab "${tabId}".` : 'No active tab. Open one with tab_open.');
    return t;
  }

  list() { return this.order.map((id) => ({ ...this.tabs.get(id).info(), active: id === this.activeId })); }

  create({ profile, activate = true } = {}) {
    const name = Profiles.validate(profile || this.settings.defaultProfile);
    const ses = this.profiles.get(name);
    const id = `t${++this.seq}`;
    const tab = new Tab({ id, profile: name, session: ses, onEvent: this.onEvent });
    this.tabs.set(id, tab);
    this.order.push(id);
    this.win.contentView.addChildView(tab.view);
    tab.view.setVisible(false);
    tab.view.setBounds(this.bounds);
    if (activate || !this.activeId) this.activate(id);
    this.onEvent({ type: 'tabs-changed', tabs: this.list() });
    log.info('tab created', id, 'profile', name);
    return tab;
  }

  activate(id) {
    if (!this.tabs.has(id)) throw new Error(`No tab "${id}".`);
    for (const [tid, t] of this.tabs) t.view.setVisible(tid === id);
    const t = this.tabs.get(id);
    t.view.setBounds(this.bounds);
    this.win.contentView.addChildView(t.view); // raise to top of the stack
    this.activeId = id;
    this.onEvent({ type: 'tabs-changed', tabs: this.list() });
    return t;
  }

  close(id) {
    const t = this.tabs.get(id);
    if (!t) throw new Error(`No tab "${id}".`);
    try { this.win.contentView.removeChildView(t.view); } catch (_) {}
    t.destroy();
    this.tabs.delete(id);
    this.order = this.order.filter((x) => x !== id);
    if (this.activeId === id) {
      this.activeId = null;
      const next = this.order[this.order.length - 1];
      if (next) this.activate(next);
    }
    this.onEvent({ type: 'tabs-changed', tabs: this.list() });
    return { closed: id, remaining: this.order.length };
  }

  setBounds(b) {
    this.bounds = b;
    for (const [id, t] of this.tabs) if (id === this.activeId) t.view.setBounds(b);
  }

  // ---- talking to the page agent
  call(tab, method, args = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = `c${++this.callSeq}`;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Page did not answer "${method}" within ${timeoutMs} ms. It may still be loading, or a modal dialog is blocking it.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { tab.wc.send('cb:call', { id, method, args }); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }

  async loadURL(tab, url, { wait = true, timeoutMs = 20000 } = {}) {
    const target = this.normaliseUrl(url);
    const done = wait ? this.waitForLoad(tab, timeoutMs) : Promise.resolve();
    try {
      await tab.wc.loadURL(target);
    } catch (e) {
      // ERR_ABORTED fires for redirects and for downloads; not fatal.
      if (!/ERR_ABORTED/.test(String(e.message))) throw e;
    }
    await done;
    return tab.info();
  }

  waitForLoad(tab, timeoutMs = 20000) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (settled) return; settled = true; cleanup(); setTimeout(resolve, 60); };
      const onStop = () => finish();
      const onFail = (_e, code, desc, url, isMainFrame) => { if (isMainFrame && code !== -3) finish(); };
      const timer = setTimeout(finish, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        try { tab.wc.off('did-stop-loading', onStop); tab.wc.off('did-fail-load', onFail); } catch (_) {}
      };
      tab.wc.on('did-stop-loading', onStop);
      tab.wc.on('did-fail-load', onFail);
    });
  }

  normaliseUrl(input) {
    const s = String(input || '').trim();
    if (!s) return this.settings.homeUrl;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    if (/^localhost(:\d+)?(\/|$)/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s)) return 'http://' + s;
    if (/^[^\s/]+\.[a-z]{2,}(\/|$|\?|:)/i.test(s)) return 'https://' + s;
    return this.settings.searchUrl.replace('%s', encodeURIComponent(s));
  }
}

module.exports = { TabManager, Tab };
