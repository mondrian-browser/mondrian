// Solve a site: capture a few of its pages, label them with Jev, derive its directory
// entry. NEXT.md, site directory.
//
//   node tools/sites/solve.js <url> [<url>...]     one site; more urls of it are found from the first
//   node tools/sites/solve.js --file sites.txt     one url or site per line; # comments
//   --pages 4        pages per site to capture (default 4)
//   --profile claude the browser profile to capture in (default claude)
//   --no-label       capture and derive only (derive needs labels, so this only captures)
//
// The browser must be running (`status` from the MCP, or `npm start`). Cost: about 2
// cents and three minutes a site. Every page captured joins the corpus under
// corpus/pages/<host>-<n>/ and is listed in tools/corpus/sites.json, so the scorecard
// sees it too; corpus/FROZEN.md says what that means for the labels.
//
// What "solved" means: directory/<host>.json maps the site's stable selectors to block
// types at Jev's accuracy (84% top label, 97% right-or-acceptable on the corpus) rather
// than the rules' 62 to 70%. Regions the entry does not cover fall back to the rules.
// Flagged regions (low confidence or a tie) are counted and left for review; the entry
// uses Jev's choice for them meanwhile.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { connect, ROOT } = require('../lib/control');

const SITES_FILE = path.join(ROOT, 'tools', 'corpus', 'sites.json');
const PAGES_DIR = path.join(ROOT, 'corpus', 'pages');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const has = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const PER_SITE = Number(flag('--pages', 4));
const PROFILE = flag('--profile', 'claude');
const NO_LABEL = has('--no-label');
const FILE = flag('--file', null);

const inputs = FILE ? fs.readFileSync(FILE, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean) : argv;
if (!inputs.length) { console.error('usage: solve.js <url>... | --file sites.txt'); process.exit(1); }

const host = (u) => { try { return new URL(u.includes('://') ? u : 'https://' + u).host.replace(/^www\./, ''); } catch { return null; } };
const toUrl = (u) => u.includes('://') ? u : 'https://' + u;
const slug = (h) => h.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

// Group the inputs by site.
const sites = new Map();
for (const u of inputs) { const h = host(u); if (!h) continue; if (!sites.has(h)) sites.set(h, []); sites.get(h).push(toUrl(u)); }

function run(script, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${script} failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

// Find more pages on the site from a start page: same host, distinct paths, prefer
// deeper paths (articles) over the shallow ones (sections), skip obvious non-pages.
const FIND_LINKS = `(() => {
  const out = new Map();
  for (const a of document.querySelectorAll('a[href]')) {
    let u; try { u = new URL(a.href); } catch { continue; }
    if (u.host.replace(/^www[.]/, '') !== location.host.replace(/^www[.]/, '')) continue;
    if (/\\.(pdf|zip|jpg|png|gif|mp4|mp3|xml|rss)$/i.test(u.pathname) || /^#|^javascript:/.test(a.getAttribute('href') || '')) continue;
    if (/\\/(login|signin|signup|register|account|cart|checkout|search|tag|tags|author|feed|rss|privacy|terms|cookies?|contact|about)\\b/i.test(u.pathname)) continue;
    u.hash = ''; const key = u.origin + u.pathname;
    if (key === location.origin + location.pathname) continue;
    const depth = u.pathname.split('/').filter(Boolean).length;
    const r = a.getBoundingClientRect();
    if (!out.has(key)) out.set(key, { url: u.href, depth, text: (a.textContent || '').trim().slice(0, 80), y: r.top + scrollY });
  }
  return [...out.values()].sort((a, b) => b.depth - a.depth || a.y - b.y).slice(0, 40);
})()`;

async function discover(client, startUrl, want) {
  const tab = await client.call('tab_open', { url: startUrl, profile: PROFILE, activate: true, wait: true });
  const tabId = tab.id || tab.tabId;
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const { value: links } = await client.call('eval_js', { tabId, code: FIND_LINKS });
    // Mix depths: some deep (articles), some shallow (sections), for repetition across kinds.
    const deep = links.filter((l) => l.depth >= 2), shallow = links.filter((l) => l.depth < 2);
    const picked = [];
    while (picked.length < want && (deep.length || shallow.length)) {
      if (deep.length) picked.push(deep.shift());
      if (picked.length < want && shallow.length) picked.push(shallow.shift());
    }
    return picked.map((l) => l.url);
  } finally {
    await client.call('tab_close', { tabId }).catch(() => {});
  }
}

(async () => {
  const client = await connect();
  const existing = fs.existsSync(SITES_FILE) ? JSON.parse(fs.readFileSync(SITES_FILE, 'utf8')) : [];
  const summary = [];
  for (const [site, urls] of sites) {
    const t0 = Date.now();
    process.stdout.write(`\n== ${site}\n`);
    let list = [...new Set(urls)];
    if (list.length < PER_SITE) {
      process.stdout.write(`   finding ${PER_SITE - list.length} more pages from ${list[0]} … `);
      try { const more = await discover(client, list[0], PER_SITE - list.length); list.push(...more.filter((u) => !list.includes(u))); console.log(`${more.length} found`); }
      catch (e) { console.log(`failed: ${e.message}`); }
    }
    list = list.slice(0, PER_SITE);
    const base = slug(site);
    const taken = new Set(existing.filter((e) => e.site === site).map((e) => e.id));
    const entries = [];
    let n = 1;
    for (const url of list) {
      if (existing.some((e) => e.site === site && e.url === url)) continue;
      while (taken.has(`${base}-${n}`) || fs.existsSync(path.join(PAGES_DIR, `${base}-${n}`))) n++;
      entries.push({ id: `${base}-${n}`, url, site, kind: 'directory', tier: 'relayout', addedAt: new Date().toISOString().slice(0, 10) });
      taken.add(`${base}-${n}`); n++;
    }
    if (!entries.length) { console.log('   nothing new to capture'); }
    existing.push(...entries);
    fs.writeFileSync(SITES_FILE, JSON.stringify(existing, null, 1));
    const ids = existing.filter((e) => e.site === site).map((e) => e.id);
    // Capture, links, label, apply, derive. Each step is its own script so it can be rerun alone.
    process.stdout.write(`   capturing ${entries.length} page(s) … `);
    const cap = run('tools/corpus/capture.js', ['--list', SITES_FILE, ...ids]);
    console.log((cap.match(/manifest: .*/) || ['done'])[0]);
    run('tools/corpus/add-cover-links.js', ids);
    if (!NO_LABEL) {
      process.stdout.write(`   labelling … `);
      const lab = run('tools/label/label.js', ids);
      const flagged = ids.map((id) => { const m = lab.match(new RegExp(`^${id}\\s+(\\d+) regions, (\\d+) flagged`, 'm')); return m ? [Number(m[1]), Number(m[2])] : [0, 0]; });
      const regions = flagged.reduce((s, x) => s + x[0], 0), fl = flagged.reduce((s, x) => s + x[1], 0);
      console.log(`${regions} regions, ${fl} flagged for review`);
      run('tools/label/review.js', ['--apply', path.join(ROOT, 'tools', 'label', 'judgements', 'corpus-all.json')]);
      process.stdout.write(`   deriving … `);
      const der = run('tools/sites/derive.js', [site]);
      console.log(der.trim().split('\n').pop().replace(site, '').trim());
      summary.push({ site, pages: ids.length, regions, flagged: fl, seconds: Math.round((Date.now() - t0) / 1000) });
    }
  }
  if (summary.length) {
    console.log('\nsolved:');
    for (const s of summary) console.log(`  ${s.site.padEnd(26)} ${s.pages} pages  ${String(s.regions).padStart(4)} regions  ${String(s.flagged).padStart(3)} flagged  ${s.seconds}s`);
    console.log(`\nreview the flagged ones later with: node tools/label/review.js`);
  }
  client.close();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
