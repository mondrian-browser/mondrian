'use strict';
const { app, BaseWindow, WebContentsView, ipcMain, Menu, shell, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const { paths, loadSettings } = require('./paths');
const log = require('./log').make('main');
const { Rules } = require('./rules');
const { Profiles } = require('./profiles');
const { TabManager } = require('./tabs');
const { ControlServer } = require('./control');
const { Adblock } = require('./adblock');
const { makeHandlers } = require('./handlers');

const TOPBAR = 84;   // tab strip + toolbar, in CSS px
const PANEL = 340;   // activity panel width when open

let settings = loadSettings();
const state = { theme: settings.theme || 'default', panelOpen: false };

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors,site-per-process-for-subframes');
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');

let win, chromeView, tabsMgr, rules, profiles, control, handlers, adblock;

function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try {
    fs.mkdirSync(paths.config, { recursive: true });
    const onDisk = fs.existsSync(paths.settingsFile) ? JSON.parse(fs.readFileSync(paths.settingsFile, 'utf8')) : {};
    fs.writeFileSync(paths.settingsFile, JSON.stringify({ ...onDisk, ...patch }, null, 2) + '\n');
  } catch (e) { log.warn('settings save failed', e.message); }
}

function layout() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  chromeView.setBounds({ x: 0, y: 0, width, height });
  const w = Math.max(200, width - (state.panelOpen ? PANEL : 0));
  tabsMgr.setBounds({ x: 0, y: TOPBAR, width: w, height: Math.max(100, height - TOPBAR) });
}

const chrome = {
  get wc() {
    if (!chromeView) throw new Error('The browser UI is not up yet.');
    return chromeView.webContents;
  },
  async send(channel, payload) {
    if (!chromeView) return false; // still booting; the UI asks for a full state on ready
    try { chromeView.webContents.send(channel, payload); } catch (e) { log.warn('chrome send failed', channel, e.message); }
    return true;
  },
};

// Blocked requests arrive in bursts; the counter is worth showing, not worth
// a message per hit.
const blockedPending = new Set();
let blockedTimer = null;
function scheduleBlockedUpdate(tab) {
  blockedPending.add(tab);
  if (blockedTimer) return;
  blockedTimer = setTimeout(() => {
    blockedTimer = null;
    for (const t of blockedPending) {
      if (tabsMgr.tabs.has(t.id)) broadcast({ type: 'tab-updated', tabId: t.id, ...t.info() });
    }
    blockedPending.clear();
  }, 600);
}

function broadcast(event) {
  control?.broadcast(event);
  chrome.send('ui:event', event);
}

async function reapplyRules() {
  for (const tab of tabsMgr.tabs.values()) {
    try { await tabsMgr.call(tab, 'setRules', rules.payloadForUrl(tab.url), 4000); } catch (_) {}
  }
  broadcast({ type: 'rules-changed', rules: rules.list() });
}

function attachContextMenu(wc, tabId) {
  wc.on('context-menu', (_e, props) => {
    const items = [];
    if (props.linkURL) items.push(
      { label: 'Open link in new tab', click: () => handlers.tab_open({ url: props.linkURL, activate: true, wait: false }) },
      { label: 'Copy link', click: () => clipboard.writeText(props.linkURL) },
      { type: 'separator' },
    );
    if (props.selectionText) items.push({ label: 'Copy', role: 'copy' }, { type: 'separator' });
    if (props.isEditable) items.push({ label: 'Paste', role: 'paste' }, { label: 'Select all', role: 'selectAll' }, { type: 'separator' });
    items.push(
      { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: 'Reload', click: () => wc.reload() },
      { type: 'separator' },
      { label: 'Inspect', click: () => wc.openDevTools({ mode: 'detach' }) },
    );
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

function attachShortcuts(wc) {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = process.platform === 'darwin' ? input.meta : input.control;
    const hit = (fn) => { event.preventDefault(); fn(); };
    if (mod && input.key.toLowerCase() === 't') return hit(() => handlers.tab_open({ activate: true, wait: false }).then(() => chrome.send('ui:focus-omnibox', {})));
    if (mod && input.key.toLowerCase() === 'w') return hit(() => { if (tabsMgr.activeId) handlers.tab_close({ tabId: tabsMgr.activeId }); });
    if (mod && input.key.toLowerCase() === 'l') return hit(() => chrome.send('ui:focus-omnibox', {}));
    if (mod && input.key.toLowerCase() === 'r') return hit(() => tabsMgr.get().wc.reload());
    if (input.key === 'F5') return hit(() => tabsMgr.get().wc.reload());
    if (mod && input.shift && input.key.toLowerCase() === 'i') return hit(() => tabsMgr.get().wc.openDevTools({ mode: 'detach' }));
    if (mod && input.shift && input.key.toLowerCase() === 'p') return hit(() => { state.panelOpen = !state.panelOpen; chrome.send('ui:panel', { open: state.panelOpen }); layout(); });
    if (mod && input.key === 'Tab') return hit(() => {
      const ids = tabsMgr.order;
      if (ids.length < 2) return;
      const i = ids.indexOf(tabsMgr.activeId);
      tabsMgr.activate(ids[(i + (input.shift ? -1 : 1) + ids.length) % ids.length]);
    });
  });
}

async function boot() {
  rules = new Rules({ onChange: () => broadcast({ type: 'rules-changed', rules: rules.list() }) });
  rules.load();
  rules.watch();

  // Loaded before any session exists, so the first request is already filtered.
  adblock = new Adblock({ settings });
  try { await adblock.load(); } catch (e) { log.warn('adblock degraded:', e.message); }
  rules.adblock = adblock;

  profiles = new Profiles({
    settings,
    rules,
    onNetwork: (wcId, entry) => {
      const tab = tabsMgr?.byWebContentsId(wcId);
      if (tab && tab.pushNetwork(entry)) scheduleBlockedUpdate(tab);
    },
  });

  win = new BaseWindow({
    width: settings.window.width,
    height: settings.window.height,
    minWidth: 640,
    minHeight: 480,
    show: false,
    frame: false,
    backgroundColor: '#12121a',
    title: 'Claude Browser',
  });

  tabsMgr = new TabManager({ settings, profiles, onEvent: (e) => broadcast(e) });
  tabsMgr.attachWindow(win);

  // Rules match against the TOP-LEVEL page, not the individual request, so that
  // "on YouTube, block X" means what it says.
  rules.tabUrlFor = (webContentsId) => tabsMgr.byWebContentsId(webContentsId)?.url || null;

  // The page preload asks for its rules synchronously, before the page's own scripts run.
  ipcMain.on('cb:rules-for-url', (event, url) => {
    try { event.returnValue = rules.payloadForUrl(url); }
    catch (e) { log.error('rules-for-url', e.message); event.returnValue = []; }
  });

  // Chrome UI drives the browser through the very same commands Claude uses.
  ipcMain.handle('chrome:cmd', async (_e, { cmd, args }) => {
    try { return { ok: true, result: await dispatch(cmd, args || {}) }; }
    catch (err) { return { ok: false, error: String(err?.message || err) }; }
  });
  ipcMain.handle('chrome:ready', () => ({
    settings: { homeUrl: settings.homeUrl, defaultProfile: settings.defaultProfile, claudeProfile: settings.claudeProfile },
    theme: { name: state.theme, css: readTheme(state.theme), custom: readTheme('custom') },
    tabs: tabsMgr.list(),
    rules: rules.list(),
    adblock: adblock.status(),
    topbar: TOPBAR,
    panel: PANEL,
  }));

  // Constructed now so handlers can reference it, but not started until the app is
  // fully up: control.json appearing is the signal that commands are safe to send.
  control = new ControlServer({ settings, dispatch: (cmd, args) => dispatch(cmd, args) });

  handlers = makeHandlers({
    tabsMgr, rules, profiles, settings, win, chrome, control, state, adblock,
    layout, saveSettings, reapplyRules, broadcast,
  });

  // The UI is created last, once every handler it may call exists.
  chromeView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-chrome.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  chromeView.setBackgroundColor('#12121a');
  win.contentView.addChildView(chromeView);
  attachShortcuts(chromeView.webContents);
  await chromeView.webContents.loadFile(path.join(paths.chrome, 'index.html'));

  // New tab / window.open requests from pages.
  const origBroadcast = broadcast;
  tabsMgr.onEvent = (e) => {
    if (e.type === 'window-open' && e.url) {
      handlers.tab_open({ url: e.url, profile: e.profile, activate: true, wait: false }).catch((err) => log.warn('window-open', err.message));
      return;
    }
    origBroadcast(e);
  };

  // Rules, context menu and shortcuts for every new tab.
  const origCreate = tabsMgr.create.bind(tabsMgr);
  tabsMgr.create = (opts) => {
    const tab = origCreate(opts);
    attachContextMenu(tab.wc, tab.id);
    attachShortcuts(tab.wc);
    tab.wc.on('dom-ready', () => {
      tabsMgr.call(tab, 'setRules', rules.payloadForUrl(tab.url), 4000).catch(() => {});
    });
    return tab;
  };

  win.on('resize', layout);
  win.on('close', () => { control.stop(); });
  app.on('window-all-closed', () => app.quit());

  layout();
  win.show();

  const startUrl = process.argv.find((a) => a.startsWith('--url='))?.slice(6) || settings.homeUrl;
  await handlers.tab_open({ url: startUrl, activate: true, wait: false });
  layout();

  await control.start();
  log.info('ready on port', control.port);
  if (process.env.CB_ANNOUNCE) process.stdout.write(`CLAUDE_BROWSER_READY ${control.port}\n`);
}

function readTheme(name) {
  try { return fs.readFileSync(path.join(paths.themes, `${name}.css`), 'utf8'); } catch (_) { return ''; }
}

async function dispatch(cmd, args) {
  const fn = handlers?.[cmd];
  if (!fn) throw new Error(`Unknown command "${cmd}". Run status to see what this build supports.`);
  return fn(args || {});
}

app.whenReady().then(boot).catch((e) => {
  log.error('boot failed', e.stack || e.message);
  process.stderr.write(`boot failed: ${e.stack || e.message}\n`);
  app.exit(1);
});

app.on('will-quit', () => control?.stop());
process.on('uncaughtException', (e) => log.error('uncaught', e.stack || e.message));
process.on('unhandledRejection', (e) => log.error('unhandled rejection', String(e)));
