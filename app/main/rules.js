'use strict';
// Site rules: per-site blocking, redirecting, CSS stripping and JS injection.
// A rule set is one JSON file in rules/. Files are watched, so editing one applies live.
//
//   {
//     "enabled": true,
//     "title": "Clean YouTube",
//     "match": ["*://*.youtube.com/*"],        // which PAGES this applies to
//     "block": ["*://*/youtubei/v1/next*"],    // requests to kill on those pages
//     "redirect": [{ "from": "*://youtube.com/shorts/*", "to": "https://www.youtube.com/watch?v=$1" }],
//     "css": "ytd-reel-shelf-renderer { display:none !important }",
//     "js": "console.log('hi')",               // runs at document-start and on SPA route change
//     "options": { "anything": "readable by the rule's own js via window.__cbRuleOptions" }
//   }

const fs = require('fs');
const path = require('path');
const { paths } = require('./paths');
const log = require('./log').make('rules');

function globToRegex(pattern) {
  if (pattern === '<all_urls>' || pattern === '*') return /^.*$/;
  const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = esc.replace(/\*/g, '(.*)').replace(/\?/g, '.');
  return new RegExp('^' + body + '$', 'i');
}

class Rules {
  constructor({ onChange } = {}) {
    this.sets = new Map(); // name -> {name, file, rule, matchRes, blockRes, redirects, hits}
    this.onChange = onChange || (() => {});
    this.tabUrlFor = () => null; // set by main: webContentsId -> top-level url
    this.adblock = null;        // set by main; consulted after the site rules
    this.watcher = null;
  }

  load() {
    this.sets.clear();
    let files = [];
    try { files = fs.readdirSync(paths.rules).filter((f) => f.endsWith('.json')); } catch (_) { files = []; }
    for (const f of files) {
      const name = f.replace(/\.json$/, '');
      try {
        const rule = JSON.parse(fs.readFileSync(path.join(paths.rules, f), 'utf8'));
        this.sets.set(name, this.compile(name, path.join(paths.rules, f), rule));
      } catch (e) {
        log.error('bad rule file', f, e.message);
      }
    }
    log.info('loaded', this.sets.size, 'rule sets:', [...this.sets.keys()].join(', '));
    this.onChange();
    return this.list();
  }

  compile(name, file, rule) {
    const prev = this.sets.get(name);
    return {
      name,
      file,
      rule,
      matchRes: (rule.match || []).map(globToRegex),
      blockRes: (rule.block || []).map(globToRegex),
      redirects: (rule.redirect || []).map((r) => ({ re: globToRegex(r.from), to: r.to })),
      hits: prev ? prev.hits : { blocked: 0, redirected: 0, applied: 0 },
    };
  }

  watch() {
    if (this.watcher) return;
    try {
      let t = null;
      this.watcher = fs.watch(paths.rules, () => {
        clearTimeout(t);
        t = setTimeout(() => { log.info('rules/ changed, reloading'); this.load(); }, 150);
      });
    } catch (e) { log.warn('cannot watch rules dir', e.message); }
  }

  save(name, rule) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) throw new Error(`Invalid rule name "${name}".`);
    const file = path.join(paths.rules, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(rule, null, 2) + '\n');
    this.sets.set(name, this.compile(name, file, rule));
    this.onChange();
    return this.info(name);
  }

  toggle(name, enabled) {
    const s = this.sets.get(name);
    if (!s) throw new Error(`No rule set "${name}".`);
    s.rule.enabled = !!enabled;
    fs.writeFileSync(s.file, JSON.stringify(s.rule, null, 2) + '\n');
    this.onChange();
    return this.info(name);
  }

  info(name) {
    const s = this.sets.get(name);
    if (!s) return null;
    return {
      name: s.name,
      title: s.rule.title || s.name,
      enabled: s.rule.enabled !== false,
      match: s.rule.match || [],
      blockPatterns: (s.rule.block || []).length,
      redirects: (s.rule.redirect || []).length,
      hasCss: !!s.rule.css,
      hasJs: !!s.rule.js,
      hasMainJs: !!s.rule.mainJs,
      hits: s.hits,
    };
  }

  list() { return [...this.sets.keys()].map((n) => this.info(n)); }
  get(name) { const s = this.sets.get(name); return s ? s.rule : null; }

  active() { return [...this.sets.values()].filter((s) => s.rule.enabled !== false); }

  // Rule sets whose match[] covers this page URL.
  forUrl(url) {
    if (!url) return [];
    return this.active().filter((s) => s.matchRes.some((re) => re.test(url)));
  }

  // What the preload needs at document-start: css + js + options, in file order.
  // Ad-blocking element hiding rides the same channel so it lands before first paint.
  payloadForUrl(url) {
    const sets = this.forUrl(url);
    for (const s of sets) s.hits.applied++;
    const payload = sets.map((s) => ({
      name: s.name,
      css: s.rule.css || '',
      js: s.rule.js || '',            // isolated world
      mainJs: s.rule.mainJs || '',    // page's own world, once per document
      options: s.rule.options || {},
    }));
    const cos = this.adblock?.cosmetics(url);
    if (cos && (cos.css || cos.scripts.length)) {
      payload.unshift({ name: 'adblock', css: cos.css, js: '', scripts: cos.scripts, options: {} });
    }
    return payload;
  }

  attachSession(ses, profileName) {
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      try {
        const pageUrl = this.tabUrlFor(details.webContentsId) || details.url;
        const sets = this.forUrl(pageUrl);
        // Site rules first: an explicit rule you wrote outranks the filter lists.
        for (const s of sets) {
          for (const r of s.redirects) {
            const m = r.re.exec(details.url);
            if (m) {
              const to = r.to.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '');
              if (to && to !== details.url) {
                s.hits.redirected++;
                log.debug('redirect', details.url, '->', to);
                return callback({ redirectURL: to });
              }
            }
          }
          for (const re of s.blockRes) {
            if (re.test(details.url)) {
              s.hits.blocked++;
              return callback({ cancel: true });
            }
          }
        }
        // Then the ad and tracker lists.
        const ad = this.adblock?.match(details, pageUrl);
        if (ad?.redirect) return callback({ redirectURL: ad.redirect });
        if (ad?.block) return callback({ cancel: true });
        callback({});
      } catch (e) {
        log.error('onBeforeRequest', e.message);
        callback({});
      }
    });
    log.debug('rules attached to session', profileName);
  }
}

module.exports = { Rules, globToRegex };
