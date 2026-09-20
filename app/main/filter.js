'use strict';
// The design filter, main-process side. Decides per page what the preload does
// (relayout, skinned, contained, or nothing), hands it the site's directory entry and
// the model's path, and keeps each tab's result for the chrome and for Claude.
//
// Tier, in order of authority: a rule set with "tier" matching the page (rules/*.json,
// the rules engine's new job per the concept), the site's directory entry
// (directory/<host>.json, `tier` field), then settings.filter.tier, default relayout.
// Pages the filter never touches: anything not http(s), PDFs, the browser's own
// composed pages, and about:.
//
// The preload asks synchronously at document-start, before the page's own scripts run.

const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const log = require('./log').make('filter');

const ROOT = path.resolve(__dirname, '..', '..');
const DIRECTORY = path.join(ROOT, 'directory');
const MODEL = path.join(ROOT, 'corpus', 'model', 'gbt.json');
const CSS = path.join(ROOT, 'app', 'filter', 'layout.css');
const TIERS = new Set(['relayout', 'skinned', 'contained']);

class Filter {
  constructor({ settings, rules, tabsMgr, saveSettings }) {
    this.settings = settings;
    this.rules = rules;
    this.tabsMgr = tabsMgr;
    this.saveSettings = saveSettings;
    this.cfg = { enabled: true, tier: 'relayout', ...(settings.filter || {}) };
    this.overrides = new Map(); // tabId -> { enabled?, tier? } for this tab only
    this.directoryCache = new Map();
    this.modelPath = fs.existsSync(MODEL) ? MODEL : null;
    if (!this.modelPath) log.warn(`no model at ${path.relative(ROOT, MODEL)}; the filter runs on rules and the directory only. Make one with: npm run classify:train -- --final`);
    this.css = '';
    this.loadCss();
    fs.watch(path.dirname(CSS), { persistent: false }, () => this.loadCss());
    ipcMain.on('cb:filter-for-url', (event, url) => {
      try { event.returnValue = this.configFor(url, this.tabsMgr.byWebContentsId(event.sender.id)); }
      catch (e) { log.error('filter-for-url', e.message); event.returnValue = { enabled: false }; }
    });
    ipcMain.on('cb:filter-result', (event, result) => {
      const tab = this.tabsMgr.byWebContentsId(event.sender.id);
      if (!tab) return;
      tab.filter = result;
      tab.console.push({ t: Date.now(), level: 'info', message: `[mondrian] filter: ${result.tier}${result.reason ? ' (' + result.reason + ')' : ''}, ${result.counts ? `${result.counts.keep} kept, ${result.counts.demote} set aside, ${result.counts.drop} dropped, ${result.elapsed} ms` : ''}` });
      this.tabsMgr.onEvent({ type: 'tab-updated', tabId: tab.id, ...tab.info() });
    });
  }

  loadCss() {
    try { this.css = fs.readFileSync(CSS, 'utf8'); } catch (e) { log.error('layout.css', e.message); }
  }

  host(url) {
    try { return new URL(url).host.replace(/^www\./, '').toLowerCase(); } catch (_) { return null; }
  }

  eligible(url) {
    if (!/^https?:/i.test(url)) return false;
    if (/\.pdf(\?|#|$)/i.test(url)) return false;
    return true;
  }

  directoryFor(host) {
    if (!host) return null;
    if (this.directoryCache.has(host)) return this.directoryCache.get(host);
    let entry = null;
    for (const h of [host, host.replace(/^[^.]+\./, '')]) {
      const file = path.join(DIRECTORY, h + '.json');
      if (fs.existsSync(file)) { try { entry = JSON.parse(fs.readFileSync(file, 'utf8')); break; } catch (e) { log.warn(`directory ${h}: ${e.message}`); } }
    }
    this.directoryCache.set(host, entry);
    return entry;
  }

  configFor(url, tab) {
    const over = tab ? this.overrides.get(tab.id) || {} : {};
    const enabled = over.enabled !== undefined ? over.enabled : this.cfg.enabled;
    if (!enabled || !this.eligible(url)) return { enabled: false, tier: 'contained', reason: enabled ? 'not eligible' : 'off' };
    const host = this.host(url);
    const entry = this.directoryFor(host);
    let tier = this.cfg.tier || 'relayout', reason = 'default';
    if (entry && TIERS.has(entry.tier)) { tier = entry.tier; reason = 'directory'; }
    for (const set of this.rules.forUrl(url)) if (set.rule && TIERS.has(set.rule.tier)) { tier = set.rule.tier; reason = `rule ${set.name}`; }
    if (over.tier) { tier = over.tier; reason = 'this tab'; }
    return {
      enabled: true, tier, reason, host,
      directory: entry ? entry.blocks : null,
      modelPath: this.modelPath,
      css: this.css,
    };
  }

  // Commands.
  status() {
    return { enabled: this.cfg.enabled, tier: this.cfg.tier, model: this.modelPath ? path.relative(ROOT, this.modelPath) : null, directoryEntries: fs.existsSync(DIRECTORY) ? fs.readdirSync(DIRECTORY).filter((f) => f.endsWith('.json')).length : 0 };
  }

  set({ enabled, tier }, tab) {
    if (tier !== undefined && !TIERS.has(tier)) throw new Error(`tier must be one of ${[...TIERS].join(', ')}.`);
    if (tab) {
      const o = this.overrides.get(tab.id) || {};
      if (enabled !== undefined) o.enabled = enabled;
      if (tier !== undefined) o.tier = tier;
      this.overrides.set(tab.id, o);
      return { tabId: tab.id, ...o };
    }
    if (enabled !== undefined) this.cfg.enabled = enabled;
    if (tier !== undefined) this.cfg.tier = tier;
    this.saveSettings({ filter: { enabled: this.cfg.enabled, tier: this.cfg.tier } });
    return this.status();
  }
}

module.exports = { Filter };
