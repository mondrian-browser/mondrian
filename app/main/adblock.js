'use strict';
// Ad and tracker blocking, on EasyList + EasyPrivacy via the Ghostery engine.
//
// The engine deliberately does NOT install its own session hooks. Electron allows one
// webRequest listener per event per session, and rules.js already owns onBeforeRequest.
// So this exposes match() and cosmeticCss() and the rules engine consults it. One
// listener, one order of precedence, no silent clobbering.

const fs = require('fs');
const path = require('path');
const { FiltersEngine, Request, ENGINE_VERSION } = require('@ghostery/adblocker');
const { parse: parseDomain } = require('tldts-experimental');
const { paths } = require('./paths');
const log = require('./log').make('adblock');

const CACHE = path.join(paths.runtime, 'adblock-engine.bin');
const META = path.join(paths.runtime, 'adblock-meta.json');

// Electron resourceType -> adblocker request type.
const TYPES = {
  mainFrame: 'document', subFrame: 'subdocument', stylesheet: 'stylesheet', script: 'script',
  image: 'image', font: 'font', object: 'object', xhr: 'xhr', ping: 'ping',
  cspReport: 'csp_report', media: 'media', webSocket: 'websocket', other: 'other',
};

class Adblock {
  constructor({ settings }) {
    this.settings = settings.adblock || {};
    this.engine = null;        // prebuilt lists
    this.custom = null;        // settings.adblock.customFilters
    this.ready = false;
    this.degraded = null;      // reason, when running without the prebuilt lists
    this.updatedAt = null;
    this.stats = { blocked: 0, checked: 0, scriptlets: 0 };
  }

  get enabled() { return this.settings.enabled !== false; }

  async load() {
    const stale = this.loadFromCache();
    if (!this.engine) {
      await this.fetchEngine();
    } else if (stale) {
      // Serve from cache now, refresh behind the scenes.
      this.fetchEngine().catch((e) => log.warn('background refresh failed', e.message));
    }
    this.buildCustom(); // after the engine, so custom filters inherit its scriptlet resources
    this.ready = true;
    return this.status();
  }

  buildCustom() {
    const lines = (this.settings.customFilters || []).filter(Boolean);
    try {
      this.custom = lines.length ? FiltersEngine.parse(lines.join('\n')) : null;
      // A parsed engine has no scriptlet library of its own, so ##+js(...) in a custom
      // filter expands to nothing. Share the prebuilt engine's resources with it.
      if (this.custom && this.engine?.resources) this.custom.resources = this.engine.resources;
      if (lines.length) log.info('custom filters:', lines.length);
    } catch (e) {
      log.error('custom filters failed to parse', e.message);
      this.custom = null;
    }
  }

  loadFromCache() {
    try {
      const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
      if (meta.engineVersion !== ENGINE_VERSION) { log.info('cached engine is for another engine version, refetching'); return true; }
      this.engine = FiltersEngine.deserialize(fs.readFileSync(CACHE));
      this.updatedAt = meta.updatedAt;
      const ageHours = (Date.now() - new Date(meta.updatedAt).getTime()) / 36e5;
      log.info(`engine from cache, ${ageHours.toFixed(0)} h old`);
      return ageHours > (this.settings.refreshHours ?? 72);
    } catch (_) {
      return true;
    }
  }

  async fetchEngine() {
    const list = this.settings.lists === 'ads-only' ? 'fromPrebuiltAdsOnly'
      : this.settings.lists === 'full' ? 'fromPrebuiltFull'
      : 'fromPrebuiltAdsAndTracking';
    try {
      const t = Date.now();
      const engine = await FiltersEngine[list](fetch);
      this.engine = engine;
      this.degraded = null;
      this.updatedAt = new Date().toISOString();
      fs.writeFileSync(CACHE, Buffer.from(engine.serialize()));
      fs.writeFileSync(META, JSON.stringify({ engineVersion: ENGINE_VERSION, updatedAt: this.updatedAt, list }, null, 2));
      log.info(`engine "${list}" downloaded in ${Date.now() - t} ms`);
    } catch (e) {
      if (!this.engine) {
        this.degraded = `Could not download filter lists (${e.message}). Blocking is limited to custom filters until the next update.`;
        log.warn(this.degraded);
      }
      throw e;
    }
  }

  async update() {
    await this.fetchEngine();
    this.buildCustom();
    return this.status();
  }

  hostOf(url) {
    try { return new URL(url).hostname; } catch (_) { return ''; }
  }

  allowlisted(pageUrl) {
    const host = this.hostOf(pageUrl);
    if (!host) return false;
    return (this.settings.allowlist || []).some((d) => host === d || host.endsWith('.' + d));
  }

  // Called by rules.js for every request. pageUrl is the top-level page, not the request.
  match(details, pageUrl) {
    if (!this.enabled || !this.ready) return null;
    if (this.allowlisted(pageUrl)) return null;
    const type = TYPES[details.resourceType] || 'other';
    if (type === 'document') return null; // never block a top-level navigation
    this.stats.checked++;
    let req;
    try {
      req = Request.fromRawDetails({ url: details.url, type, sourceUrl: pageUrl || details.url });
    } catch (_) { return null; }
    for (const engine of [this.custom, this.engine]) {
      if (!engine) continue;
      let r;
      try { r = engine.match(req); } catch (_) { continue; }
      if (r?.redirect?.dataUrl) { this.stats.blocked++; return { redirect: r.redirect.dataUrl }; }
      if (r?.match) { this.stats.blocked++; return { block: true }; }
    }
    return null;
  }

  // Element hiding and scriptlets, handed to the page preload so both land before
  // first paint. Scriptlets run in the page's main world; see preload-page.js.
  cosmetics(pageUrl) {
    const empty = { css: '', scripts: [] };
    if (!this.enabled || !this.ready) return empty;
    if (this.allowlisted(pageUrl)) return empty;
    const hostname = this.hostOf(pageUrl);
    if (!hostname) return empty;
    const domain = parseDomain(hostname).domain || hostname;
    let css = '';
    const scripts = [];
    for (const engine of [this.custom, this.engine]) {
      if (!engine) continue;
      try {
        const c = engine.getCosmeticsFilters({ url: pageUrl, hostname, domain });
        if (c?.styles) css += (css ? '\n' : '') + c.styles;
        if (c?.scripts?.length) scripts.push(...c.scripts);
      } catch (_) { /* skip */ }
    }
    if (scripts.length) this.stats.scriptlets += scripts.length;
    return { css, scripts };
  }

  setAllowlist(list) {
    this.settings.allowlist = list;
    return this.settings.allowlist;
  }

  status() {
    return {
      enabled: this.enabled,
      ready: this.ready,
      lists: this.settings.lists || 'ads-and-tracking',
      updatedAt: this.updatedAt,
      refreshHours: this.settings.refreshHours ?? 72,
      customFilters: (this.settings.customFilters || []).length,
      allowlist: this.settings.allowlist || [],
      stats: this.stats,
      degraded: this.degraded,
      // scriptlets is an Array here, not a Map: read length, not size.
      scriptlets: this.engine?.resources?.scriptlets?.length ?? this.engine?.resources?.scriptlets?.size ?? 0,
    };
  }
}

module.exports = { Adblock };
