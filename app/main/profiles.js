'use strict';
// Profiles = isolated Electron session partitions. Each has its own cookies, storage, cache.
// "lloyd" is for Lloyd's own browsing; "claude" is for accounts Claude uses. Any name works.
const { session, app } = require('electron');
const log = require('./log').make('profiles');

const { pathToFileURL } = require('url');
const { paths } = require('./paths');

class Profiles {
  constructor({ settings, rules, onNetwork }) {
    this.settings = settings;
    this.rules = rules;
    this.onNetwork = onNetwork;
    this.sessions = new Map(); // name -> Session
    // pathToFileURL, not string concatenation: on Windows a drive-letter path needs
    // the empty-host slash (file:///C:/...), and "file://" + path silently does not
    // match, which quietly disables the composed-page framing scope.
    this.pagesPrefix = pathToFileURL(paths.pages).href.replace(/\/?$/, '/');
  }

  isComposedPage(url) { return typeof url === 'string' && url.startsWith(this.pagesPrefix); }

  static partition(name) { return `persist:profile-${name}`; }

  static validate(name) {
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(name)) {
      throw new Error(`Invalid profile name "${name}". Use letters, digits, - and _ (max 32).`);
    }
    return name.toLowerCase();
  }

  get(name) {
    name = Profiles.validate(name);
    if (this.sessions.has(name)) return this.sessions.get(name);
    const ses = session.fromPartition(Profiles.partition(name));
    this.configure(ses, name);
    this.sessions.set(name, ses);
    log.info('profile ready', name);
    return ses;
  }

  names() { return [...this.sessions.keys()]; }

  configure(ses, name) {
    // Look like a normal Chrome to sites: drop the Electron and app tokens from the UA.
    const ua = ses.getUserAgent()
      .replace(/ ?Electron\/[\d.]+/g, '')
      .replace(/ ?claude-browser\/[\d.]+/g, '')
      + (this.settings.userAgentSuffix || '');
    ses.setUserAgent(ua);

    const allow = new Set(this.settings.permissions?.allow || []);
    ses.setPermissionRequestHandler((wc, permission, callback) => {
      const ok = allow.has(permission);
      log.info('permission', name, permission, ok ? 'allowed' : 'denied');
      callback(ok);
    });
    ses.setPermissionCheckHandler((wc, permission) => allow.has(permission));

    // Rules engine owns onBeforeRequest for this session (block + redirect).
    this.rules.attachSession(ses, name);

    // Composed pages in pages/ are allowed to frame sites that refuse framing.
    // This is deliberately narrow: only subframes, and only when the TOP-LEVEL page
    // is one of our own composed files. Normal browsing keeps every protection.
    ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
      try {
        if (details.resourceType !== 'subFrame') return callback({});
        const top = this.rules.tabUrlFor(details.webContentsId) || '';
        if (!this.isComposedPage(top)) return callback({});
        const headers = { ...details.responseHeaders };
        for (const key of Object.keys(headers)) {
          const k = key.toLowerCase();
          if (k === 'x-frame-options') delete headers[key];
          else if (k === 'content-security-policy' || k === 'content-security-policy-report-only') {
            headers[key] = headers[key].map((v) => v.replace(/frame-ancestors[^;]*;?/gi, ''));
          }
        }
        callback({ responseHeaders: headers });
      } catch (e) {
        log.warn('onHeadersReceived', e.message);
        callback({});
      }
    });

    // Lightweight network log per tab.
    ses.webRequest.onCompleted({ urls: ['<all_urls>'] }, (d) => {
      this.onNetwork(d.webContentsId, { t: Date.now(), method: d.method, url: d.url, status: d.statusCode, type: d.resourceType, fromCache: d.fromCache });
    });
    ses.webRequest.onErrorOccurred({ urls: ['<all_urls>'] }, (d) => {
      this.onNetwork(d.webContentsId, { t: Date.now(), method: d.method, url: d.url, error: d.error, type: d.resourceType, blocked: d.error === 'net::ERR_BLOCKED_BY_CLIENT' });
    });

    ses.on('will-download', (event, item) => {
      log.info('download', name, item.getFilename(), item.getURL());
    });
  }

  async clear(name) {
    const ses = this.get(name);
    await ses.clearStorageData();
    await ses.clearCache();
    await ses.clearAuthCache();
    log.info('profile cleared', name);
  }
}

module.exports = { Profiles };
