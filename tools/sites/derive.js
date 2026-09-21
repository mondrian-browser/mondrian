// Derive a site's directory entry from its labelled pages. NEXT.md, site directory.
//
//   node tools/sites/derive.js <site>...        write directory/<site>.json for these sites
//   node tools/sites/derive.js --all            every site in the corpus with labels
//   node tools/sites/derive.js --test           leave-one-page-out: derive from the other
//                                              pages of each site, score on the held one
//
// A directory entry maps selectors to block types for one site:
//
//   { "site": "bbc.com", "pages": 4, "derivedAt": ..., "blocks": [
//       { "selector": "main article > div.ssrcss-1f3bvyz-Stack", "type": "teaser_card", "n": 9, "purity": 1 }, ... ] }
//
// Selectors are built from what the extractor records for a region (landmark chain,
// tag, classes, id), so they can be matched offline against regions.json and at
// runtime against the DOM with the same meaning. A class is used only when it looks
// stable: not a styled-components or CSS-in-JS hash, not a utility class; CSS-module
// names (Part_name__h4sh) become prefix selectors. A selector is kept when it is pure
// across the site's pages (one type at least three quarters of the time).

'use strict';

const fs = require('fs');
const path = require('path');
const { loadPages, ROOT } = require('../classify/corpus');
const { classifyAll } = require('../classify/heuristic');

const DIR = path.join(ROOT, 'directory');
const argv = process.argv.slice(2);
const has = (f) => { const i = argv.indexOf(f); if (i < 0) return false; argv.splice(i, 1); return true; };
const ALL = has('--all');
const TEST = has('--test');
const SITES = new Set(argv);

const HASHY = /^(sc-|css-|jsx-|emotion-|chakra-)|[0-9a-f]{6,}|^[a-z]{1,2}$|^[A-Za-z]{5,8}$|^_/;
const UTILITY = /^(flex|grid|block|inline|hidden|relative|absolute|sticky|fixed|static|w-|h-|p-|m-|px-|py-|pl-|pr-|pt-|pb-|mt|mb|ml|mr|mx|my|text-|bg-|border|rounded|shadow|d-|justify|items|self|gap|col|row|container|wrapper|inner|outer|clearfix|sr-only|visually-hidden|lg:|md:|sm:|xl:|font-|leading|tracking|space-|overflow|z-|opacity|transition|cursor|min-|max-|top-|left-|right-|bottom-|order-|basis|grow|shrink|flex-|fd-|ai-|jc-|fw-|ps-|pe-|ms-|me-|g-|gs-|bs-|bc-|fs-|fc-|wmx|wmn|hmx|hmn|ws-|ta-|va-|lh-|ff-|us-|ov-|s-)/;

function stableClass(cls) {
  for (const c of (cls || '').split(/\s+/).filter(Boolean)) {
    if (UTILITY.test(c)) continue;
    const mod = c.match(/^([A-Za-z][A-Za-z0-9-]*_[A-Za-z0-9-]+)__[A-Za-z0-9_-]{4,}$/);
    if (mod) return `[class*="${mod[1]}__"]`;
    if (HASHY.test(c)) continue;
    if (/^[A-Za-z][A-Za-z0-9_-]{2,}$/.test(c)) return `.${c}`;
  }
  return '';
}

function selectorOf(r) {
  const lm = (r.landmarks || []).map((l) => l.startsWith('role=') ? `[role=${l.slice(5)}]` : l).join(' ');
  const tag = r.tag.replace(/×\d+$/, '');
  const id = r.id && !HASHY.test(r.id) && /^[A-Za-z][\w-]{2,}$/.test(r.id) && !/\d{3,}/.test(r.id) ? `#${r.id}` : '';
  const cls = stableClass(r.class);
  if (!id && !cls) return `${lm} > ${tag}`.trim();
  return `${lm} > ${tag}${id || cls}`.trim();
}

function derive(pages) {
  const groups = {};
  for (const p of pages) {
    for (const a of p.labels) {
      const r = p.regions[a.index];
      const sel = selectorOf(r);
      const g = groups[sel] = groups[sel] || { n: 0, types: {}, pages: new Set() };
      g.n++; g.types[a.final] = (g.types[a.final] || 0) + 1; g.pages.add(p.id);
    }
  }
  const blocks = [];
  for (const [selector, g] of Object.entries(groups)) {
    const [type, count] = Object.entries(g.types).sort((a, b) => b[1] - a[1])[0];
    const purity = count / g.n;
    const bareTag = !/[.#\[]/.test(selector.split(' > ').pop());
    if (bareTag && g.n < 3) continue;          // "main > div" from one region says nothing
    if (purity < 0.75) continue;
    blocks.push({ selector, type, n: g.n, purity: +purity.toFixed(2), pages: g.pages.size });
  }
  blocks.sort((a, b) => b.n - a.n);
  return blocks;
}

function lookup(blocks, r) {
  const sel = selectorOf(r);
  const b = blocks.find((x) => x.selector === sel);
  return b ? b.type : null;
}

function main() {
const pages = loadPages();
const calls = classifyAll(pages);
const bySite = {};
for (const p of pages) (bySite[p.site] = bySite[p.site] || []).push(p);

if (TEST) {
  let covered = 0, right = 0, total = 0, sitesTested = 0, rulesRight = 0, combinedRight = 0;
  const perSite = [];
  for (const [site, list] of Object.entries(bySite)) {
    if (list.length < 2) continue;
    sitesTested++;
    let sc = 0, sr = 0, st = 0;
    for (const held of list) {
      const blocks = derive(list.filter((p) => p !== held));
      for (const a of held.labels) {
        st++;
        const t = lookup(blocks, held.regions[a.index]);
        const rule = calls.get(held.id + ':' + a.index).type;
        if (rule === a.final) rulesRight++;
        if ((t || rule) === a.final) combinedRight++;
        if (t) { sc++; if (t === a.final) sr++; }
      }
    }
    covered += sc; right += sr; total += st;
    perSite.push({ site, pages: list.length, regions: st, coverage: sc / st, accuracy: sc ? sr / sc : 0 });
  }
  const pct = (x) => (100 * x).toFixed(0) + '%';
  console.log(`leave-one-page-out over ${sitesTested} sites with 2+ pages, ${total} regions`);
  console.log(`coverage ${pct(covered / total)}   accuracy on covered ${pct(right / covered)}   directory alone ${pct(right / total)}   rules alone ${pct(rulesRight / total)}   directory then rules ${pct(combinedRight / total)}\n`);
  for (const s of perSite.sort((a, b) => b.regions - a.regions)) console.log(`  ${s.site.padEnd(24)} ${String(s.pages).padStart(2)} pages ${String(s.regions).padStart(5)} regions   coverage ${pct(s.coverage).padStart(4)}   accuracy ${pct(s.accuracy).padStart(4)}`);
} else {
  const targets = ALL ? Object.keys(bySite) : [...SITES];
  if (!targets.length) { console.error('usage: derive.js <site>... | --all | --test'); process.exit(1); }
  fs.mkdirSync(DIR, { recursive: true });
  for (const site of targets) {
    const list = bySite[site];
    if (!list) { console.log(`${site}: no labelled pages in the corpus`); continue; }
    const blocks = derive(list);
    const file = path.join(DIR, site.replace(/[^a-z0-9.-]/gi, '_') + '.json');
    const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    // The site's tier (ADR 0011): the most common tier of its corpus pages, which pages.js
    // set by hand for the first 74 and solve.js sets to relayout; a rule can override.
    // Hand-set tiers (pages.js) outrank solve.js's default.
    const hand = list.filter((p) => p.kind !== 'directory');
    const tiers = {}; for (const p of (hand.length ? hand : list)) tiers[p.tier || 'relayout'] = (tiers[p.tier || 'relayout'] || 0) + 1;
    const tier = Object.entries(tiers).sort((a, b) => b[1] - a[1])[0][0];
    const entry = { ...existing, site, tier, pages: list.length, pageIds: list.map((p) => p.id), derivedAt: new Date().toISOString(), blocks };
    fs.writeFileSync(file, JSON.stringify(entry, null, 1));
    const regions = list.reduce((n, p) => n + p.labels.length, 0);
    const coveredN = blocks.reduce((n, b) => n + b.n, 0);
    console.log(`${site.padEnd(24)} ${list.length} pages, ${regions} regions -> ${blocks.length} selectors covering ${coveredN} (${(100 * coveredN / regions).toFixed(0)}%)  ${path.relative(ROOT, file)}`);
  }
}

}

if (require.main === module) main();

module.exports = { selectorOf, derive, lookup };
